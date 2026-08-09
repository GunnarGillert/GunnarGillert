using AlamosHA.Core.Models;
using AlamosHA.Core.Tests.Fakes;
using Xunit;

namespace AlamosHA.Core.Tests;

public class FailoverEngineTests
{
    private static FailoverEngine CreateEngine(
        AppConfig config,
        out FakeTailscaleClient tailscale,
        out FakeAlarmServiceController service,
        out FakePeerStatusClient peerStatus,
        out FakeRoleStateStore roleStore,
        out FakeClock clock,
        NodeRole initialStoredRole = NodeRole.Unknown)
    {
        tailscale = new FakeTailscaleClient();
        service = new FakeAlarmServiceController();
        peerStatus = new FakePeerStatusClient();
        roleStore = new FakeRoleStateStore(initialStoredRole);
        clock = new FakeClock();
        return new FailoverEngine(config, tailscale, service, peerStatus, roleStore, clock);
    }

    [Fact]
    public async Task ColdStart_PrimarySite_BecomesMasterAndStartsService()
    {
        var config = TestConfig.Create(isPrimaryByDefault: true);
        var engine = CreateEngine(config, out _, out var service, out _, out var roleStore, out _);

        await engine.InitializeAsync();

        Assert.Equal(NodeRole.Master, engine.CurrentRole);
        Assert.Equal(1, service.StartCallCount);
        Assert.True(service.IsRunning);
        Assert.Contains(NodeRole.Master, roleStore.SavedRoles);
    }

    [Fact]
    public async Task ColdStart_SecondarySite_StaysStandbyAndDoesNotStartService()
    {
        var config = TestConfig.Create(isPrimaryByDefault: false);
        var engine = CreateEngine(config, out _, out var service, out _, out _, out _);

        await engine.InitializeAsync();

        Assert.Equal(NodeRole.Standby, engine.CurrentRole);
        Assert.Equal(0, service.StartCallCount);
        Assert.False(service.IsRunning);
    }

    [Fact]
    public async Task RestartAfterCrash_RestoresPersistedMasterRoleAndEnsuresServiceRunning()
    {
        // Standby-Standort war zuvor schon zum Master befördert worden (gespeicherter Zustand),
        // das Wächter-Programm wurde aber neu gestartet und der Dienst lief (noch) nicht.
        var config = TestConfig.Create(isPrimaryByDefault: false);
        var engine = CreateEngine(config, out _, out var service, out _, out _, out _, initialStoredRole: NodeRole.Master);

        await engine.InitializeAsync();

        Assert.Equal(NodeRole.Master, engine.CurrentRole);
        Assert.Equal(1, service.StartCallCount);
    }

    [Fact]
    public async Task PeerOnline_StaysStandby()
    {
        var config = TestConfig.Create(isPrimaryByDefault: false);
        var engine = CreateEngine(config, out var tailscale, out var service, out _, out _, out var clock);
        await engine.InitializeAsync();

        tailscale.NextStatus = new TailscaleDeviceStatus("peer-1", "Buedingen", clock.UtcNow.AddSeconds(-30));

        var result = await engine.RunOnceAsync();

        Assert.Equal(PollResultKind.PeerOnline, result.Kind);
        Assert.Equal(NodeRole.Standby, engine.CurrentRole);
        Assert.Equal(0, service.StartCallCount);
    }

    [Fact]
    public async Task ApiUnreachable_DoesNotChangeRoleOrService()
    {
        var config = TestConfig.Create(isPrimaryByDefault: false);
        var engine = CreateEngine(config, out var tailscale, out var service, out _, out _, out _);
        await engine.InitializeAsync();

        tailscale.NextException = new HttpRequestException("DNS-Fehler");

        var result = await engine.RunOnceAsync();

        Assert.Equal(PollResultKind.ApiUnreachable, result.Kind);
        Assert.Equal(NodeRole.Standby, engine.CurrentRole);
        Assert.Equal(0, service.StartCallCount);
    }

    [Fact]
    public async Task PeerNotFoundInTailnet_DoesNotChangeRole()
    {
        var config = TestConfig.Create(isPrimaryByDefault: false);
        var engine = CreateEngine(config, out var tailscale, out var service, out _, out _, out _);
        await engine.InitializeAsync();

        tailscale.NextStatus = null;

        var result = await engine.RunOnceAsync();

        Assert.Equal(PollResultKind.PeerNotFound, result.Kind);
        Assert.Equal(NodeRole.Standby, engine.CurrentRole);
        Assert.Equal(0, service.StartCallCount);
    }

    [Fact]
    public async Task PeerOffline_PromotesOnlyAfterHysteresisThreshold()
    {
        var config = TestConfig.Create(isPrimaryByDefault: false, consecutiveOfflineChecksRequired: 3, offlineThresholdSeconds: 60);
        var engine = CreateEngine(config, out var tailscale, out var service, out var peerStatus, out _, out var clock);
        await engine.InitializeAsync();

        var longAgo = clock.UtcNow.AddMinutes(-10);
        tailscale.NextStatus = new TailscaleDeviceStatus("peer-1", "Buedingen", longAgo);
        peerStatus.NextRole = PeerReportedRole.Unreachable; // Gegenstelle wirklich weg

        var first = await engine.RunOnceAsync();
        Assert.Equal(PollResultKind.OfflineSuspected, first.Kind);
        Assert.Equal(NodeRole.Standby, engine.CurrentRole);
        Assert.Equal(0, service.StartCallCount);

        var second = await engine.RunOnceAsync();
        Assert.Equal(PollResultKind.OfflineSuspected, second.Kind);
        Assert.Equal(0, service.StartCallCount);

        var third = await engine.RunOnceAsync();
        Assert.Equal(PollResultKind.PromotedToMaster, third.Kind);
        Assert.Equal(NodeRole.Master, engine.CurrentRole);
        Assert.Equal(1, service.StartCallCount);
        Assert.True(service.IsRunning);
    }

    [Fact]
    public async Task ShortGlitch_DoesNotTriggerFailover_CounterResetsWhenPeerComesBackOnline()
    {
        var config = TestConfig.Create(isPrimaryByDefault: false, consecutiveOfflineChecksRequired: 3, offlineThresholdSeconds: 60);
        var engine = CreateEngine(config, out var tailscale, out var service, out _, out _, out var clock);
        await engine.InitializeAsync();

        tailscale.NextStatus = new TailscaleDeviceStatus("peer-1", "Buedingen", clock.UtcNow.AddMinutes(-10));
        await engine.RunOnceAsync();
        await engine.RunOnceAsync();

        // Gegenstelle meldet sich wieder zurück, bevor die Schwelle erreicht wurde.
        tailscale.NextStatus = new TailscaleDeviceStatus("peer-1", "Buedingen", clock.UtcNow.AddSeconds(-5));
        var back = await engine.RunOnceAsync();
        Assert.Equal(PollResultKind.PeerOnline, back.Kind);

        // Erneuter kurzer Aussetzer - Zähler muss wieder bei 1 starten, nicht bei 3 weitermachen.
        tailscale.NextStatus = new TailscaleDeviceStatus("peer-1", "Buedingen", clock.UtcNow.AddMinutes(-10));
        var afterReset = await engine.RunOnceAsync();

        Assert.Equal(PollResultKind.OfflineSuspected, afterReset.Kind);
        Assert.Equal(0, service.StartCallCount);
    }

    [Fact]
    public async Task ConflictDetected_AbortsPromotionAndDoesNotStartService()
    {
        var config = TestConfig.Create(isPrimaryByDefault: false, consecutiveOfflineChecksRequired: 1, offlineThresholdSeconds: 60);
        var engine = CreateEngine(config, out var tailscale, out var service, out var peerStatus, out _, out var clock);
        await engine.InitializeAsync();

        tailscale.NextStatus = new TailscaleDeviceStatus("peer-1", "Buedingen", clock.UtcNow.AddMinutes(-10));
        peerStatus.NextRole = PeerReportedRole.Master; // Widerspruch: Gegenstelle behauptet, selbst Master zu sein

        var result = await engine.RunOnceAsync();

        Assert.Equal(PollResultKind.Conflict, result.Kind);
        Assert.Equal(NodeRole.Standby, engine.CurrentRole);
        Assert.Equal(0, service.StartCallCount);
    }

    [Fact]
    public async Task AlreadyMaster_PeerStaysOffline_DoesNotRestartServiceRepeatedly()
    {
        var config = TestConfig.Create(isPrimaryByDefault: true, offlineThresholdSeconds: 60);
        var engine = CreateEngine(config, out var tailscale, out var service, out _, out _, out var clock);
        await engine.InitializeAsync();
        Assert.Equal(1, service.StartCallCount);

        tailscale.NextStatus = new TailscaleDeviceStatus("peer-1", "Nidda", clock.UtcNow.AddMinutes(-30));

        var first = await engine.RunOnceAsync();
        var second = await engine.RunOnceAsync();

        Assert.Equal(PollResultKind.AlreadyMaster, first.Kind);
        Assert.Equal(PollResultKind.AlreadyMaster, second.Kind);
        Assert.Equal(NodeRole.Master, engine.CurrentRole);
        Assert.Equal(1, service.StartCallCount);
    }

    [Fact]
    public async Task MasterDoesNotAutoStepDown_WhenPeerComesBackOnline_ByDefault()
    {
        var config = TestConfig.Create(isPrimaryByDefault: false, autoFailback: false);
        var engine = CreateEngine(config, out var tailscale, out var service, out _, out _, out var clock, initialStoredRole: NodeRole.Master);
        await engine.InitializeAsync();

        tailscale.NextStatus = new TailscaleDeviceStatus("peer-1", "Buedingen", clock.UtcNow.AddSeconds(-10));

        var result = await engine.RunOnceAsync();

        Assert.Equal(PollResultKind.PeerOnline, result.Kind);
        Assert.Equal(NodeRole.Master, engine.CurrentRole);
        Assert.Equal(0, service.StopCallCount);
    }

    [Fact]
    public async Task AutoFailback_WhenEnabled_DemotesSecondaryOnceePrimaryIsBackOnline()
    {
        var config = TestConfig.Create(isPrimaryByDefault: false, autoFailback: true);
        var engine = CreateEngine(config, out var tailscale, out var service, out _, out _, out var clock, initialStoredRole: NodeRole.Master);
        await engine.InitializeAsync();

        tailscale.NextStatus = new TailscaleDeviceStatus("peer-1", "Buedingen", clock.UtcNow.AddSeconds(-10));

        var result = await engine.RunOnceAsync();

        Assert.Equal(PollResultKind.AutoFailback, result.Kind);
        Assert.Equal(NodeRole.Standby, engine.CurrentRole);
        Assert.Equal(1, service.StopCallCount);
    }

    [Fact]
    public async Task ForceRoleAsync_ManualOverride_ToMaster_StartsServiceImmediately()
    {
        var config = TestConfig.Create(isPrimaryByDefault: false);
        var engine = CreateEngine(config, out _, out var service, out _, out var roleStore, out _);
        await engine.InitializeAsync();

        await engine.ForceRoleAsync(NodeRole.Master);

        Assert.Equal(NodeRole.Master, engine.CurrentRole);
        Assert.Equal(1, service.StartCallCount);
        Assert.Contains(NodeRole.Master, roleStore.SavedRoles);
    }

    [Fact]
    public async Task ForceRoleAsync_ManualOverride_ToStandby_StopsService()
    {
        var config = TestConfig.Create(isPrimaryByDefault: true);
        var engine = CreateEngine(config, out _, out var service, out _, out _, out _);
        await engine.InitializeAsync();
        Assert.True(service.IsRunning);

        await engine.ForceRoleAsync(NodeRole.Standby);

        Assert.Equal(NodeRole.Standby, engine.CurrentRole);
        Assert.Equal(1, service.StopCallCount);
        Assert.False(service.IsRunning);
    }
}
