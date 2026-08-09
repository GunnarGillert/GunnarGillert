using System.Net.Sockets;
using System.Text;
using AlamosHA.Core.Abstractions;
using AlamosHA.Core.Models;

namespace AlamosHA.Core.Adapters;

/// <summary>Client-Gegenstück zu <see cref="PeerRoleAnnouncer"/>: fragt die Gegenstelle direkt über das Tailnet nach ihrer Rolle.</summary>
public sealed class TcpPeerStatusClient : IPeerStatusClient
{
    private readonly string _host;
    private readonly int _port;
    private readonly TimeSpan _timeout;

    public TcpPeerStatusClient(string host, int port, TimeSpan? timeout = null)
    {
        _host = host;
        _port = port;
        _timeout = timeout ?? TimeSpan.FromSeconds(3);
    }

    public async Task<PeerReportedRole> GetPeerRoleAsync(CancellationToken ct)
    {
        try
        {
            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeoutCts.CancelAfter(_timeout);

            using var client = new TcpClient();
            await client.ConnectAsync(_host, _port, timeoutCts.Token);

            var stream = client.GetStream();
            using var writer = new StreamWriter(stream, Encoding.ASCII, leaveOpen: true) { AutoFlush = true, NewLine = "\n" };
            using var reader = new StreamReader(stream, Encoding.ASCII, false, 256, leaveOpen: true);

            await writer.WriteLineAsync("ROLE?".AsMemory(), timeoutCts.Token);
            var line = await reader.ReadLineAsync(timeoutCts.Token);

            return line?.Trim().ToUpperInvariant() switch
            {
                "MASTER" => PeerReportedRole.Master,
                "STANDBY" => PeerReportedRole.Standby,
                _ => PeerReportedRole.Unknown,
            };
        }
        catch (Exception ex) when (ex is IOException or SocketException or OperationCanceledException)
        {
            return PeerReportedRole.Unreachable;
        }
    }
}
