using AlamosHA.Core.Abstractions;
using AlamosHA.Core.Models;

namespace AlamosHA.Core;

/// <summary>
/// Kernlogik der Hochverfügbarkeit zwischen den beiden Alamos-Standorten.
///
/// Ablauf pro Aufruf von <see cref="RunOnceAsync"/>:
///   1. Status der Gegenstelle über die Tailscale-API abfragen. Ist die API selbst nicht
///      erreichbar, wird NICHTS entschieden (die eigene Verbindung könnte gestört sein -
///      die API dient als unabhängiger Zeuge/Quorum, ohne sie keine Übernahme).
///   2. Ist die Gegenstelle laut Tailscale-Heartbeat aktuell (online), bleibt alles wie es ist.
///   3. Erscheint sie offline, wird über mehrere Zyklen (Hysterese) gezählt, um kurze Aussetzer
///      nicht als Ausfall zu werten.
///   4. Erst wenn die Schwelle erreicht ist, wird zusätzlich direkt bei der Gegenstelle
///      nachgefragt (Konflikt-Check) - antwortet sie entgegen der Tailscale-Meldung doch als
///      Master, wird die Übernahme sicherheitshalber abgebrochen, um doppelte Alarmierung zu
///      vermeiden.
///   5. Erst dann wird dieser Standort zum Master befördert und der Alamos-Dienst gestartet.
///
/// Ein Standort, der bereits Master ist, gibt die Rolle NICHT automatisch wieder ab, sobald die
/// Gegenstelle zurückkommt (Flapping- und Unterbrechungsschutz für einen laufenden Alarm) - es
/// sei denn, AutoFailback ist explizit aktiviert. Die Rückgabe erfolgt sonst über die manuelle
/// Bedienung in der Oberfläche (<see cref="ForceRoleAsync"/>).
/// </summary>
public sealed class FailoverEngine
{
    private readonly AppConfig _config;
    private readonly ITailscaleClient _tailscaleClient;
    private readonly IAlarmServiceController _serviceController;
    private readonly IPeerStatusClient _peerStatusClient;
    private readonly IRoleStateStore _roleStore;
    private readonly IClock _clock;

    private bool _initialized;
    private int _consecutiveOfflineChecks;

    public FailoverEngine(
        AppConfig config,
        ITailscaleClient tailscaleClient,
        IAlarmServiceController serviceController,
        IPeerStatusClient peerStatusClient,
        IRoleStateStore roleStore,
        IClock clock)
    {
        _config = config;
        _tailscaleClient = tailscaleClient;
        _serviceController = serviceController;
        _peerStatusClient = peerStatusClient;
        _roleStore = roleStore;
        _clock = clock;
    }

    public NodeRole CurrentRole { get; private set; } = NodeRole.Unknown;

    /// <summary>
    /// Muss vor dem ersten <see cref="RunOnceAsync"/> aufgerufen werden (oder wird von diesem
    /// implizit beim ersten Aufruf ausgeführt). Lädt die zuletzt gespeicherte Rolle bzw. legt bei
    /// einem echten Erststart die konfigurierte Default-Rolle fest und sorgt dafür, dass der
    /// Alamos-Dienst-Zustand dazu passt.
    /// </summary>
    public async Task InitializeAsync(CancellationToken ct = default)
    {
        if (_initialized)
        {
            return;
        }

        var storedRole = _roleStore.LoadRole();
        CurrentRole = storedRole != NodeRole.Unknown
            ? storedRole
            : _config.IsPrimaryByDefault ? NodeRole.Master : NodeRole.Standby;

        if (storedRole == NodeRole.Unknown)
        {
            _roleStore.SaveRole(CurrentRole);
        }

        await EnsureServiceMatchesRoleAsync(ct);
        _initialized = true;
    }

    public async Task<PollResult> RunOnceAsync(CancellationToken ct = default)
    {
        if (!_initialized)
        {
            await InitializeAsync(ct);
        }

        TailscaleDeviceStatus? peer;
        try
        {
            peer = await _tailscaleClient.GetPeerStatusAsync(_config.PeerDeviceId, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _consecutiveOfflineChecks = 0;
            return PollResult.ApiUnreachable(CurrentRole, ex.Message);
        }

        if (peer is null)
        {
            _consecutiveOfflineChecks = 0;
            return PollResult.PeerNotFound(CurrentRole);
        }

        var age = _clock.UtcNow - peer.LastSeen;
        var peerOnline = age <= TimeSpan.FromSeconds(_config.OfflineThresholdSeconds);

        if (peerOnline)
        {
            _consecutiveOfflineChecks = 0;

            if (CurrentRole == NodeRole.Master && _config.AutoFailback && !_config.IsPrimaryByDefault)
            {
                await DemoteToStandbyAsync(ct);
                return PollResult.AutoFailback(CurrentRole);
            }

            return PollResult.PeerOnline(CurrentRole, age);
        }

        _consecutiveOfflineChecks++;

        if (CurrentRole == NodeRole.Master)
        {
            return PollResult.AlreadyMaster(CurrentRole, age, _consecutiveOfflineChecks);
        }

        if (_consecutiveOfflineChecks < _config.ConsecutiveOfflineChecksRequired)
        {
            return PollResult.OfflineSuspected(CurrentRole, age, _consecutiveOfflineChecks, _config.ConsecutiveOfflineChecksRequired);
        }

        var peerReportedRole = await _peerStatusClient.GetPeerRoleAsync(ct);
        if (peerReportedRole == PeerReportedRole.Master)
        {
            return PollResult.Conflict(CurrentRole, age);
        }

        await PromoteToMasterAsync(ct);
        return PollResult.PromotedToMaster(CurrentRole, age);
    }

    /// <summary>Manuelle Bedienung über die Oberfläche - überschreibt die automatische Entscheidung sofort.</summary>
    public async Task ForceRoleAsync(NodeRole role, CancellationToken ct = default)
    {
        switch (role)
        {
            case NodeRole.Master:
                await PromoteToMasterAsync(ct);
                break;
            case NodeRole.Standby:
                await DemoteToStandbyAsync(ct);
                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(role), role, "Rolle muss Master oder Standby sein.");
        }
    }

    private async Task PromoteToMasterAsync(CancellationToken ct)
    {
        CurrentRole = NodeRole.Master;
        _roleStore.SaveRole(CurrentRole);
        await _serviceController.StartAsync(ct);
        _consecutiveOfflineChecks = 0;
    }

    private async Task DemoteToStandbyAsync(CancellationToken ct)
    {
        CurrentRole = NodeRole.Standby;
        _roleStore.SaveRole(CurrentRole);
        await _serviceController.StopAsync(ct);
        _consecutiveOfflineChecks = 0;
    }

    private async Task EnsureServiceMatchesRoleAsync(CancellationToken ct)
    {
        var running = await _serviceController.IsRunningAsync(ct);
        switch (CurrentRole)
        {
            case NodeRole.Master when !running:
                await _serviceController.StartAsync(ct);
                break;
            case NodeRole.Standby when running:
                await _serviceController.StopAsync(ct);
                break;
        }
    }
}
