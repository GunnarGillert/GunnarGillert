using System.Net;
using System.Net.Http;
using System.Windows.Threading;
using AlamosHA.Core;
using AlamosHA.Core.Adapters;
using AlamosHA.Core.Models;

namespace AlamosHA.App;

/// <summary>
/// Verdrahtet die Core-Engine mit ihren echten Windows-/Netzwerk-Implementierungen und übernimmt
/// den periodischen Aufruf über einen DispatcherTimer, damit UI-Updates ohne zusätzliche
/// Thread-Synchronisierung direkt aus dem Timer-Tick heraus möglich sind.
/// </summary>
public sealed class WatchdogHost : IAsyncDisposable
{
    private readonly AppConfig _config;
    private readonly FailoverEngine _engine;
    private readonly PeerRoleAnnouncer _announcer;
    private readonly HttpClient _httpClient;
    private readonly DispatcherTimer _timer;

    public WatchdogHost(AppConfig config, string roleStatePath)
    {
        _config = config;

        _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
        var tailscaleClient = new TailscaleApiClient(_httpClient, config.Tailnet, config.ApiKey);
        var serviceController = new WindowsAlarmServiceController(config.AlamosServiceName);
        var peerStatusClient = new TcpPeerStatusClient(config.PeerTailscaleHost, config.PeerStatusPort);
        var roleStore = new JsonFileRoleStateStore(roleStatePath);

        _engine = new FailoverEngine(config, tailscaleClient, serviceController, peerStatusClient, roleStore, new SystemClock());

        _announcer = new PeerRoleAnnouncer(IPAddress.Any, config.PeerStatusPort);

        _timer = new DispatcherTimer(DispatcherPriority.Background)
        {
            Interval = TimeSpan.FromSeconds(config.PollIntervalSeconds),
        };
        _timer.Tick += async (_, _) => await PollAsync();
    }

    public string SiteName => _config.SiteName;

    public NodeRole CurrentRole => _engine.CurrentRole;

    public bool AutomaticEnabled { get; private set; } = true;

    public event EventHandler<PollResult>? PollCompleted;

    public event EventHandler? RoleChanged;

    public async Task StartAsync()
    {
        _announcer.Start();
        await _engine.InitializeAsync();
        _announcer.CurrentRole = _engine.CurrentRole;
        RoleChanged?.Invoke(this, EventArgs.Empty);
        _timer.Start();
    }

    public void SetAutomaticEnabled(bool enabled)
    {
        AutomaticEnabled = enabled;
        if (enabled)
        {
            _timer.Start();
        }
        else
        {
            _timer.Stop();
        }
    }

    public event EventHandler<string>? UnexpectedError;

    private async Task PollAsync()
    {
        try
        {
            var result = await _engine.RunOnceAsync();
            _announcer.CurrentRole = _engine.CurrentRole;
            PollCompleted?.Invoke(this, result);
            RoleChanged?.Invoke(this, EventArgs.Empty);
        }
        catch (Exception ex)
        {
            // Ein einzelner fehlgeschlagener Prüfzyklus darf das Wächter-Programm nicht beenden -
            // das würde jede weitere automatische Umschaltung verhindern. Nächster Versuch folgt
            // beim nächsten Timer-Tick.
            UnexpectedError?.Invoke(this, ex.Message);
        }
    }

    public async Task ForceRoleAsync(NodeRole role)
    {
        try
        {
            await _engine.ForceRoleAsync(role);
            _announcer.CurrentRole = _engine.CurrentRole;
            RoleChanged?.Invoke(this, EventArgs.Empty);
        }
        catch (Exception ex)
        {
            UnexpectedError?.Invoke(this, ex.Message);
        }
    }

    public async ValueTask DisposeAsync()
    {
        _timer.Stop();
        await _announcer.DisposeAsync();
        _httpClient.Dispose();
    }
}
