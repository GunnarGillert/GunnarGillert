using System.Text.Json;
using AlamosHA.Core.Abstractions;
using AlamosHA.Core.Models;

namespace AlamosHA.Core.Adapters;

/// <summary>
/// Speichert die aktuelle Rolle in einer kleinen JSON-Datei, damit sie einen Neustart des
/// Wächter-Programms bzw. des Rechners übersteht.
/// </summary>
public sealed class JsonFileRoleStateStore : IRoleStateStore
{
    private readonly string _filePath;

    public JsonFileRoleStateStore(string filePath)
    {
        _filePath = filePath;
    }

    public NodeRole LoadRole()
    {
        try
        {
            if (!File.Exists(_filePath))
            {
                return NodeRole.Unknown;
            }

            var json = File.ReadAllText(_filePath);
            var state = JsonSerializer.Deserialize<StateDto>(json);
            return state?.Role ?? NodeRole.Unknown;
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            return NodeRole.Unknown;
        }
    }

    public void SaveRole(NodeRole role)
    {
        var directory = Path.GetDirectoryName(_filePath);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var json = JsonSerializer.Serialize(new StateDto(role, DateTimeOffset.UtcNow));
        File.WriteAllText(_filePath, json);
    }

    private sealed record StateDto(NodeRole Role, DateTimeOffset UpdatedAtUtc);
}
