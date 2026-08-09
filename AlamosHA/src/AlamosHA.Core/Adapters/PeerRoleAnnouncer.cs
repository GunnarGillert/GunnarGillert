using System.Net;
using System.Net.Sockets;
using System.Text;
using AlamosHA.Core.Models;

namespace AlamosHA.Core.Adapters;

/// <summary>
/// Läuft auf beiden Standorten im Hintergrund und beantwortet Anfragen der Gegenstelle nach der
/// eigenen aktuellen Rolle ("ROLE?" -> "MASTER"/"STANDBY"). Bewusst ein minimales Text-Protokoll
/// über TCP statt HTTP, damit auf Windows kein administrativer URL-ACL-Eintrag nötig ist.
/// </summary>
public sealed class PeerRoleAnnouncer : IAsyncDisposable
{
    private readonly TcpListener _listener;
    private readonly CancellationTokenSource _cts = new();
    private Task? _acceptLoop;

    public PeerRoleAnnouncer(IPAddress bindAddress, int port)
    {
        _listener = new TcpListener(bindAddress, port);
    }

    /// <summary>Wird von außen laufend aktuell gehalten (z. B. von der FailoverEngine bzw. der Oberfläche).</summary>
    public NodeRole CurrentRole { get; set; } = NodeRole.Unknown;

    public void Start()
    {
        _listener.Start();
        _acceptLoop = Task.Run(() => AcceptLoopAsync(_cts.Token));
    }

    private async Task AcceptLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            TcpClient client;
            try
            {
                client = await _listener.AcceptTcpClientAsync(ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (ObjectDisposedException)
            {
                break;
            }

            _ = HandleClientAsync(client, ct);
        }
    }

    private async Task HandleClientAsync(TcpClient client, CancellationToken ct)
    {
        using (client)
        {
            try
            {
                using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                timeoutCts.CancelAfter(TimeSpan.FromSeconds(5));

                var stream = client.GetStream();
                using var reader = new StreamReader(stream, Encoding.ASCII, false, 256, leaveOpen: true);
                using var writer = new StreamWriter(stream, Encoding.ASCII, leaveOpen: true) { AutoFlush = true, NewLine = "\n" };

                var line = await reader.ReadLineAsync(timeoutCts.Token);
                if (string.Equals(line?.Trim(), "ROLE?", StringComparison.OrdinalIgnoreCase))
                {
                    await writer.WriteLineAsync(CurrentRole.ToString().ToUpperInvariant());
                }
            }
            catch (Exception ex) when (ex is IOException or OperationCanceledException or SocketException)
            {
                // Verbindungsproblem mit einem einzelnen Client - Gegenstelle fragt beim nächsten Poll erneut an.
            }
        }
    }

    public async ValueTask DisposeAsync()
    {
        _cts.Cancel();
        _listener.Stop();
        if (_acceptLoop is not null)
        {
            try
            {
                await _acceptLoop;
            }
            catch
            {
                // Aufräumen beim Beenden - ein Fehler hier ist nicht mehr relevant.
            }
        }

        _cts.Dispose();
    }
}
