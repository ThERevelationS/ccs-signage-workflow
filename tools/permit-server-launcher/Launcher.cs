// CCS Permit Server — tray launcher. Opens the fleet controller
// (scripts/permit-server.mjs in D:\DevinProjects\ccs-server) if it isn't
// answering on 127.0.0.1:4175, then drops a tray icon. --background starts
// the controller without opening the dashboard (used by Task Scheduler).
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Windows.Forms;

static class Launcher {
  const string Repo = @"D:\DevinProjects\ccs-server";
  const string Api = "http://127.0.0.1:4175";
  const string Dash = "http://localhost:4174";
  const int StartTimeoutMs = 30000;
  static NotifyIcon tray;
  static ToolStripMenuItem pauseItem, resumeItem, stopItem, verifItem, statusItem;
  static System.Windows.Forms.Timer statusTimer;

  static string HttpGet(string url) {
    try {
      var req = (HttpWebRequest)WebRequest.Create(url);
      req.Timeout = 3000; req.ReadWriteTimeout = 3000;
      using (var r = (HttpWebResponse)req.GetResponse())
      using (var s = new StreamReader(r.GetResponseStream())) return s.ReadToEnd();
    } catch { return null; }
  }
  static void HttpPost(string path, string body) {
    try {
      var req = (HttpWebRequest)WebRequest.Create(Api + path);
      req.Method = "POST"; req.ContentType = "application/json"; req.Timeout = 8000;
      var b = Encoding.UTF8.GetBytes(body ?? "{}");
      req.ContentLength = b.Length;
      using (var s = req.GetRequestStream()) s.Write(b, 0, b.Length);
      using (var r = (HttpWebResponse)req.GetResponse()) { }
    } catch { }
  }
  static bool ServerUp() { return HttpGet(Api + "/status") != null; }
  static string StatusField(string json, string key) {
    // tiny scrape — the status JSON is machine-generated, single-line order stable
    var k = "\"" + key + "\":";
    var i = json == null ? -1 : json.IndexOf(k, StringComparison.Ordinal);
    if (i < 0) return null;
    var j = i + k.Length;
    var sb = new StringBuilder();
    while (j < json.Length && (char.IsLetterOrDigit(json[j]) || json[j] == '_')) sb.Append(json[j++]);
    return sb.ToString();
  }

  static DateTime lastRelaunch = DateTime.MinValue;
  static void StartController(bool quiet = false) {
    var psi = new ProcessStartInfo {
      FileName = "node",
      Arguments = "scripts/permit-server.mjs",
      WorkingDirectory = Repo,
      UseShellExecute = false,
      CreateNoWindow = true,
      WindowStyle = ProcessWindowStyle.Hidden,
    };
    psi.EnvironmentVariables["PERMIT_AUTO_LOGIN"] = "1";
    try { Process.Start(psi); } catch (Exception e) {
      if (!quiet) MessageBox.Show("Could not start the permit server:\r\n" + e.Message, "CCS Permit Server",
        MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
  }

  static void EnsureServer() {
    if (ServerUp()) return;
    StartController();
    var until = DateTime.Now.AddMilliseconds(StartTimeoutMs);
    while (!ServerUp() && DateTime.Now < until) Thread.Sleep(500);
  }

  static Icon MakeIcon() {
    var bmp = new Bitmap(16, 16);
    using (var g = Graphics.FromImage(bmp)) {
      g.Clear(Color.FromArgb(30, 41, 59));
      g.FillRectangle(Brushes.DarkOrange, 2, 2, 12, 12);
      using (var f = new Font("Consolas", 9f, FontStyle.Bold))
        g.DrawString("P", f, Brushes.White, 2.5f, 0f);
    }
    var h = bmp.GetHicon();
    var ic = Icon.FromHandle(h);
    return ic;
  }

  static void RefreshMenu() {
    var json = HttpGet(Api + "/status");
    var up = json != null;
    var state = up ? StatusField(json, "state") : null;
    var verif = up && StatusField(json, "verification") == "true";
    statusItem.Text = up ? ("Server: " + state + (verif ? " · verification ON" : " · verification OFF")) : "Server: offline";
    pauseItem.Enabled = up && state == "running";
    resumeItem.Enabled = up && state == "paused";
    stopItem.Enabled = up && state != "stopped";
    verifItem.Enabled = up;
    verifItem.Checked = verif;
    try {
      tray.Icon = MakeIcon();
      tray.Text = up ? ("CCS Permit Server — " + state) : "CCS Permit Server — offline";
    } catch { }
  }

  [STAThread]
  static int Main(string[] args) {
    var background = args.Length > 0 && args[0] == "--background";
    bool created;
    using (var mutex = new Mutex(true, @"Global\CCS Permit Server", out created)) {
      if (!created) {
        if (!background) { try { Process.Start(Dash); } catch { } }
        return 0; // already running — a second click just opens the dashboard
      }
      EnsureServer();
      if (!background) { try { Process.Start(Dash); } catch { } }

      var menu = new ContextMenuStrip();
      statusItem = new ToolStripMenuItem("Server: …") { Enabled = false };
      menu.Items.Add(statusItem);
      menu.Items.Add(new ToolStripSeparator());
      var open = new ToolStripMenuItem("Open dashboard");
      open.Click += (s, e) => { try { Process.Start(Dash); } catch { } };
      menu.Items.Add(open);
      pauseItem = new ToolStripMenuItem("Pause");
      pauseItem.Click += (s, e) => { HttpPost("/pause", "{}"); RefreshMenu(); };
      menu.Items.Add(pauseItem);
      resumeItem = new ToolStripMenuItem("Resume");
      resumeItem.Click += (s, e) => { HttpPost("/resume", "{}"); RefreshMenu(); };
      menu.Items.Add(resumeItem);
      stopItem = new ToolStripMenuItem("Stop workers");
      stopItem.Click += (s, e) => { HttpPost("/stop", "{}"); RefreshMenu(); };
      menu.Items.Add(stopItem);
      menu.Items.Add(new ToolStripSeparator());
      verifItem = new ToolStripMenuItem("Verification mode");
      verifItem.Click += (s, e) => { var json = HttpGet(Api + "/status"); var on = json != null && StatusField(json, "verification") == "true"; HttpPost("/verification", "{\"on\":" + (on ? "false" : "true") + "}"); RefreshMenu(); };
      menu.Items.Add(verifItem);
      menu.Items.Add(new ToolStripSeparator());
      var exit = new ToolStripMenuItem("Exit tray (server keeps running)");
      exit.Click += (s, e) => { tray.Visible = false; Application.Exit(); };
      menu.Items.Add(exit);
      menu.Opening += (s, e) => RefreshMenu();

      tray = new NotifyIcon { Icon = MakeIcon(), Text = "CCS Permit Server", ContextMenuStrip = menu, Visible = true };
      tray.DoubleClick += (s, e) => { try { Process.Start(Dash); } catch { } };
      statusTimer = new System.Windows.Forms.Timer { Interval = 15000 };
      statusTimer.Tick += (s, e) => {
        RefreshMenu();
        // Watchdog: the controller has no supervisor — a silent crash used
        // to leave the fleet dead until the tray was reopened. Relaunch at
        // most every 90s so a crash-loop doesn't spawn-spam.
        if (!ServerUp() && DateTime.Now - lastRelaunch > TimeSpan.FromSeconds(90)) { lastRelaunch = DateTime.Now; StartController(true); }
      };
      statusTimer.Start();
      RefreshMenu();
      Application.Run();
      tray.Visible = false;
      return 0;
    }
  }
}
