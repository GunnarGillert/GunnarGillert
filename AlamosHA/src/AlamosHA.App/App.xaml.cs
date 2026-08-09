using System.IO;
using System.Threading;
using System.Windows;
using AlamosHA.Core.Adapters;
using AlamosHA.Core.Models;

namespace AlamosHA.App;

public partial class App : Application
{
    public static string ConfigDirectory { get; } =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "AlamosHA");

    public static string ConfigPath { get; } = Path.Combine(ConfigDirectory, "config.json");
    public static string RoleStatePath { get; } = Path.Combine(ConfigDirectory, "role-state.json");

    private Mutex? _singleInstanceMutex;
    private bool _ownsSingleInstanceMutex;
    private WatchdogHost? _host;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        DispatcherUnhandledException += (_, args) =>
        {
            MessageBox.Show(
                $"Unerwarteter Fehler:\n{args.Exception.Message}\n\nAlamosHA läuft weiter, bitte die IT/Führungsgruppe informieren, falls dies wiederholt auftritt.",
                "AlamosHA - Fehler",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            args.Handled = true;
        };

        _singleInstanceMutex = new Mutex(initiallyOwned: true, name: "Global\\AlamosHA-Wachtprogramm", out var isNew);
        _ownsSingleInstanceMutex = isNew;
        if (!isNew)
        {
            MessageBox.Show(
                "AlamosHA läuft bereits. Es darf immer nur eine Instanz gleichzeitig laufen, sonst könnten Master-Entscheidungen kollidieren.",
                "AlamosHA - bereits gestartet",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
            Shutdown();
            return;
        }

        if (!File.Exists(ConfigPath))
        {
            var setup = new SetupWindow();
            var completed = setup.ShowDialog();
            if (completed != true)
            {
                Shutdown();
                return;
            }
        }

        AppConfig config;
        try
        {
            config = ConfigStore.Load(ConfigPath);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"Die Konfiguration unter {ConfigPath} konnte nicht gelesen werden:\n{ex.Message}",
                "AlamosHA - Konfigurationsfehler",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            Shutdown();
            return;
        }

        _host = new WatchdogHost(config, RoleStatePath);

        var window = new MainWindow(_host);
        MainWindow = window;
        window.Show();

        _ = _host.StartAsync();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _host?.DisposeAsync().AsTask().GetAwaiter().GetResult();
        if (_ownsSingleInstanceMutex)
        {
            _singleInstanceMutex?.ReleaseMutex();
        }
        _singleInstanceMutex?.Dispose();
        base.OnExit(e);
    }
}
