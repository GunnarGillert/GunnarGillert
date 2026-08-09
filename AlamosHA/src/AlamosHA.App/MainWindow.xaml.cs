using System.Windows;
using System.Windows.Media;
using AlamosHA.Core;
using AlamosHA.Core.Models;
using Forms = System.Windows.Forms;

namespace AlamosHA.App;

public partial class MainWindow : Window
{
    private static readonly Brush MasterBrush = new SolidColorBrush(Color.FromRgb(0x2E, 0xA0, 0x4B));
    private static readonly Brush StandbyBrush = new SolidColorBrush(Color.FromRgb(0xE0, 0xA9, 0x2A));
    private static readonly Brush ConflictBrush = new SolidColorBrush(Color.FromRgb(0xC0, 0x39, 0x2B));
    private static readonly Brush NeutralBrush = new SolidColorBrush(Color.FromRgb(0xDD, 0xDD, 0xDD));

    private readonly WatchdogHost _host;
    private readonly Forms.NotifyIcon _trayIcon;
    private bool _reallyClose;

    public MainWindow(WatchdogHost host)
    {
        InitializeComponent();

        _host = host;
        _host.PollCompleted += OnPollCompleted;
        _host.RoleChanged += OnRoleChanged;
        _host.UnexpectedError += OnUnexpectedError;

        SiteNameText.Text = string.IsNullOrWhiteSpace(_host.SiteName) ? "AlamosHA" : $"Standort {_host.SiteName}";
        LastCheckText.Text = "Noch keine Prüfung durchgeführt.";
        UpdateRoleDisplay();

        _trayIcon = CreateTrayIcon();
    }

    private Forms.NotifyIcon CreateTrayIcon()
    {
        var menu = new Forms.ContextMenuStrip();
        menu.Items.Add("Anzeigen", null, (_, _) => ShowFromTray());
        menu.Items.Add("Beenden", null, (_, _) => { _reallyClose = true; System.Windows.Application.Current.Shutdown(); });

        var icon = new Forms.NotifyIcon
        {
            Icon = System.Drawing.SystemIcons.Shield,
            Visible = true,
            Text = "AlamosHA",
            ContextMenuStrip = menu,
        };
        icon.DoubleClick += (_, _) => ShowFromTray();
        return icon;
    }

    private void ShowFromTray()
    {
        Show();
        WindowState = WindowState.Normal;
        Activate();
    }

    protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
    {
        if (!_reallyClose)
        {
            e.Cancel = true;
            Hide();
            return;
        }

        _trayIcon.Visible = false;
        _trayIcon.Dispose();
        base.OnClosing(e);
    }

    private void OnRoleChanged(object? sender, EventArgs e) => Dispatcher.Invoke(UpdateRoleDisplay);

    private void OnUnexpectedError(object? sender, string message) => Dispatcher.Invoke(() =>
    {
        var timestamp = DateTime.Now.ToString("HH:mm:ss");
        LogListBox.Items.Insert(0, $"[{timestamp}] Fehler bei der Prüfung: {message}");
        LastCheckText.Text = $"Fehler bei der Prüfung um {timestamp}: {message}";
    });

    private void OnPollCompleted(object? sender, PollResult result) => Dispatcher.Invoke(() =>
    {
        var timestamp = DateTime.Now.ToString("HH:mm:ss");
        LogListBox.Items.Insert(0, $"[{timestamp}] {result.Message}");
        while (LogListBox.Items.Count > 200)
        {
            LogListBox.Items.RemoveAt(LogListBox.Items.Count - 1);
        }

        LastCheckText.Text = $"Letzte Prüfung um {timestamp}: {result.Message}";

        if (result.Kind == PollResultKind.Conflict)
        {
            _trayIcon.ShowBalloonTip(10000, "AlamosHA - Konflikt", result.Message, Forms.ToolTipIcon.Error);
            StatusBorder.Background = ConflictBrush;
            RoleText.Text = "KONFLIKT";
            RoleSubText.Text = "Bitte manuell prüfen - siehe Verlauf unten.";
            return;
        }

        if (result.Kind == PollResultKind.PromotedToMaster)
        {
            _trayIcon.ShowBalloonTip(10000, "AlamosHA - Übernahme", result.Message, Forms.ToolTipIcon.Warning);
        }

        UpdateRoleDisplay();
    });

    private void UpdateRoleDisplay()
    {
        switch (_host.CurrentRole)
        {
            case NodeRole.Master:
                StatusBorder.Background = MasterBrush;
                RoleText.Text = "MASTER";
                RoleSubText.Text = "Alamos-Alarmierung ist an diesem Standort aktiv.";
                break;
            case NodeRole.Standby:
                StatusBorder.Background = StandbyBrush;
                RoleText.Text = "STANDBY";
                RoleSubText.Text = "Bereitschaft - Alamos-Dienst ist hier gestoppt.";
                break;
            default:
                StatusBorder.Background = NeutralBrush;
                RoleText.Text = "UNBEKANNT";
                RoleSubText.Text = "Rolle wird ermittelt...";
                break;
        }
    }

    private async void ForceMasterButton_Click(object sender, RoutedEventArgs e)
    {
        var confirm = System.Windows.MessageBox.Show(
            "Diesen Standort jetzt manuell zum Master machen?\n\nDadurch wird hier der Alamos-Dienst gestartet und beginnt zu alarmieren. " +
            "Nur bestätigen, wenn sichergestellt ist, dass der andere Standort NICHT gleichzeitig ebenfalls alarmiert.",
            "Master erzwingen",
            MessageBoxButton.YesNo,
            MessageBoxImage.Warning,
            MessageBoxResult.No);

        if (confirm == MessageBoxResult.Yes)
        {
            await _host.ForceRoleAsync(NodeRole.Master);
        }
    }

    private async void ForceStandbyButton_Click(object sender, RoutedEventArgs e)
    {
        var confirm = System.Windows.MessageBox.Show(
            "Diesen Standort jetzt manuell auf Standby setzen?\n\nDadurch wird hier der Alamos-Dienst gestoppt. " +
            "Nur bestätigen, wenn sichergestellt ist, dass die Alarmierung an anderer Stelle weiterläuft.",
            "Standby erzwingen",
            MessageBoxButton.YesNo,
            MessageBoxImage.Warning,
            MessageBoxResult.No);

        if (confirm == MessageBoxResult.Yes)
        {
            await _host.ForceRoleAsync(NodeRole.Standby);
        }
    }

    private void AutomaticCheckBox_Changed(object sender, RoutedEventArgs e)
    {
        _host.SetAutomaticEnabled(AutomaticCheckBox.IsChecked == true);
    }
}
