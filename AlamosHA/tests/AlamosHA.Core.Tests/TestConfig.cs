using AlamosHA.Core.Models;

namespace AlamosHA.Core.Tests;

internal static class TestConfig {
    public static AppConfig Create(
        bool isPrimaryByDefault = false,
        bool autoFailback = false,
        int consecutiveOfflineChecksRequired = 3,
        int offlineThresholdSeconds = 180) => new()
    {
        SiteName = "Testwache",
        Tailnet = "-",
        ApiKey = "tskey-api-test",
        PeerDeviceId = "peer-1",
        PeerTailscaleHost = "peer-1.tailnet.ts.net",
        AlamosServiceName = "AlamosService",
        IsPrimaryByDefault = isPrimaryByDefault,
        AutoFailback = autoFailback,
        ConsecutiveOfflineChecksRequired = consecutiveOfflineChecksRequired,
        OfflineThresholdSeconds = offlineThresholdSeconds,
        PollIntervalSeconds = 20,
    };
}
