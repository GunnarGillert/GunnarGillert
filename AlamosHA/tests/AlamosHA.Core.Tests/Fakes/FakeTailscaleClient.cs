using AlamosHA.Core.Abstractions;
using AlamosHA.Core.Models;

namespace AlamosHA.Core.Tests.Fakes;

public sealed class FakeTailscaleClient : ITailscaleClient
{
    public TailscaleDeviceStatus? NextStatus { get; set; }
    public Exception? NextException { get; set; }
    public int CallCount { get; private set; }

    public Task<TailscaleDeviceStatus?> GetPeerStatusAsync(string peerDeviceId, CancellationToken ct)
    {
        CallCount++;
        if (NextException is not null)
        {
            throw NextException;
        }

        return Task.FromResult(NextStatus);
    }
}
