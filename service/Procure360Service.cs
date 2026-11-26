using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;
using System.Text;
using System.Threading;

namespace Procure360Service
{
    /// <summary>
    /// Minimal Windows service host for PROCURE360's bundled Python runtime.
    /// It starts python.exe backend\run_server.py, captures the child output
    /// into data\logs\service.log and stops the child when Windows stops the
    /// service. No external service wrapper is required.
    /// </summary>
    public sealed class Procure360Service : ServiceBase
    {
        private readonly object _sync = new object();
        private Process _child;
        private Thread _watchdog;
        private string _root;
        private string _logFile;
        private volatile bool _stopping;

        public Procure360Service()
        {
            ServiceName = "PROCURE360";
            CanStop = true;
            CanShutdown = true;
            AutoLog = true;
        }

        protected override void OnStart(string[] args)
        {
            _root = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ".."));
            string logDir = Path.Combine(_root, "data", "logs");
            Directory.CreateDirectory(logDir);
            _logFile = Path.Combine(logDir, "service.log");
            Log("Starting PROCURE360. Root=" + _root);

            string python = ResolveRuntimeSetting("python", Path.Combine(_root, "runtime", "python", "python.exe"));
            string sitePackages = ResolveRuntimeSetting(
                "site-packages",
                Path.Combine(_root, "runtime", "python", "Lib", "site-packages"));
            string script = Path.Combine(_root, "backend", "run_server.py");
            if (!File.Exists(python))
            {
                throw new FileNotFoundException("Python runtime is missing: " + python, python);
            }
            if (!File.Exists(script))
            {
                throw new FileNotFoundException("Backend entry point is missing.", script);
            }
            Log("Python runtime: " + python);

            var info = new ProcessStartInfo
            {
                FileName = python,
                Arguments = "\"" + script + "\"",
                WorkingDirectory = _root,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };
            info.EnvironmentVariables["PYTHONPATH"] = Path.Combine(_root, "backend") +
                Path.PathSeparator + sitePackages;
            info.EnvironmentVariables["PYTHONUNBUFFERED"] = "1";
            info.EnvironmentVariables["PYTHONIOENCODING"] = "utf-8";
            info.EnvironmentVariables["PYTHONUTF8"] = "1";

            var process = new Process { StartInfo = info, EnableRaisingEvents = true };
            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
            {
                if (e.Data != null) Log("[out] " + e.Data);
            };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
            {
                if (e.Data != null) Log("[err] " + e.Data);
            };

            try
            {
                if (!process.Start())
                {
                    throw new InvalidOperationException("Python process did not start.");
                }
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
                _child = process;
                Log("Python started. PID=" + process.Id);

                // Fail the service start instead of sitting idle if the app
                // cannot boot (missing dependency, bad .env, locked port...).
                if (process.WaitForExit(2500))
                {
                    throw new InvalidOperationException(
                        "PROCURE360 exited during startup with code " + process.ExitCode +
                        ". See data\\logs\\service.log.");
                }

                _watchdog = new Thread(Watchdog);
                _watchdog.IsBackground = true;
                _watchdog.Start();
            }
            catch
            {
                StopChild();
                throw;
            }
        }

        protected override void OnStop()
        {
            _stopping = true;
            Log("Stopping PROCURE360.");
            StopChild();
        }

        protected override void OnShutdown()
        {
            _stopping = true;
            StopChild();
            base.OnShutdown();
        }

        private void Watchdog()
        {
            Process child;
            lock (_sync)
            {
                child = _child;
            }
            if (child == null) return;
            try
            {
                child.WaitForExit();
            }
            catch
            {
            }
            if (_stopping) return;
            Log("Python exited unexpectedly with code " + SafeExitCode(child) + "; stopping service for recovery.");
            try
            {
                Stop();
            }
            catch (Exception ex)
            {
                Log("Could not request service stop: " + ex.Message);
            }
        }

        private static string SafeExitCode(Process process)
        {
            try
            {
                return process.ExitCode.ToString();
            }
            catch
            {
                return "unknown";
            }
        }

        private void StopChild()
        {
            Process child;
            lock (_sync)
            {
                child = _child;
                _child = null;
            }
            if (child == null) return;
            try
            {
                if (!child.HasExited)
                {
                    Log("Killing Python. PID=" + child.Id);
                    child.Kill();
                    if (!child.WaitForExit(10000))
                    {
                        Log("Python did not exit within 10 seconds.");
                    }
                }
            }
            catch (Exception ex)
            {
                Log("Error stopping Python: " + ex.Message);
            }
            finally
            {
                child.Dispose();
            }
        }

        /// <summary>
        /// Reads an optional key=value override from runtime\launch.conf. This
        /// lets an administrator switch to the system Python (and its installed
        /// site-packages) if a security product blocks the bundled executable.
        /// Lines starting with # are ignored.
        /// </summary>
        private string ResolveRuntimeSetting(string key, string fallback)
        {
            try
            {
                string conf = Path.Combine(_root, "runtime", "launch.conf");
                if (!File.Exists(conf)) return fallback;
                foreach (string raw in File.ReadAllLines(conf))
                {
                    string line = raw.Trim();
                    if (line.Length == 0 || line.StartsWith("#") || line.StartsWith(";")) continue;
                    int eq = line.IndexOf('=');
                    if (eq <= 0) continue;
                    if (line.Substring(0, eq).Trim().Equals(key, StringComparison.OrdinalIgnoreCase))
                    {
                        string value = line.Substring(eq + 1).Trim().Trim('"');
                        if (value.IndexOf('%') >= 0) value = Environment.ExpandEnvironmentVariables(value);
                        if (!Path.IsPathRooted(value)) value = Path.Combine(_root, value);
                        if (File.Exists(value) || Directory.Exists(value)) return value;
                    }
                }
            }
            catch (Exception ex)
            {
                Log("Could not read launch.conf: " + ex.Message);
            }
            return fallback;
        }

        private void Log(string message)
        {
            try
            {
                if (_logFile == null) return;
                string line = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + message + Environment.NewLine;
                lock (_sync)
                {
                    if (File.Exists(_logFile) && new FileInfo(_logFile).Length > 5 * 1024 * 1024)
                    {
                        string previous = _logFile + ".1";
                        if (File.Exists(previous)) File.Delete(previous);
                        File.Move(_logFile, previous);
                    }
                    File.AppendAllText(_logFile, line, new UTF8Encoding(false));
                }
            }
            catch
            {
                // A service must never crash because logging failed.
            }
        }

        // Allows a developer to run the exe interactively without installing
        // it as a service. Press Enter to stop the child.
        public void DebugStart()
        {
            OnStart(new string[0]);
        }

        public void DebugStop()
        {
            _stopping = true;
            StopChild();
        }

        public static void Main(string[] args)
        {
            var service = new Procure360Service();
            if (Environment.UserInteractive)
            {
                int smokeSeconds = 0;
                if (args.Length > 0 && args[0].StartsWith("--smoke", StringComparison.OrdinalIgnoreCase))
                {
                    string value = args[0].Substring("--smoke".Length).TrimStart('=');
                    if (!int.TryParse(value, out smokeSeconds) || smokeSeconds <= 0)
                    {
                        smokeSeconds = 20;
                    }
                }
                try
                {
                    service.DebugStart();
                    if (smokeSeconds > 0)
                    {
                        Console.WriteLine("PROCURE360 service host smoke test: running for " + smokeSeconds + " seconds.");
                        Thread.Sleep(smokeSeconds * 1000);
                    }
                    else
                    {
                        Console.WriteLine("PROCURE360 service host is running. Press Enter to stop.");
                        Console.ReadLine();
                    }
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine(ex.ToString());
                }
                finally
                {
                    service.DebugStop();
                }
            }
            else
            {
                ServiceBase.Run(service);
            }
        }
    }
}
