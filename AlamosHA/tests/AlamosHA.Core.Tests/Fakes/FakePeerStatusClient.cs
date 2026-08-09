using AlamosHA.Core.Abstractions;
using AlamosHA.Core.Models;

namespace AlamosHA.Core.Tests.Fakes;

public sealed class FakePeerStatusClient : IPeerStatusClient
{
    public PeerReportedRole NextRole { get; set; } = PeerReportedRole.Unreachable;
    public int CallCount { get; private set; }

    public Task<PeerReportedRole> GetPeerRoleAsync(CancellationToken ct)
    {
        CallCount++;
        return Task.FromResult(NextRole);
    }
}
