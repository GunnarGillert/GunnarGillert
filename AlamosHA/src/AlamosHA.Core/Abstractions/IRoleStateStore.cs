using AlamosHA.Core.Models;

namespace AlamosHA.Core.Abstractions;

/// <summary>
/// Speichert die zuletzt bekannte Rolle dieses Standorts dauerhaft (überlebt Neustarts der App
/// und des Rechners), damit nach einem Neustart nicht fälschlich wieder mit der Default-Rolle
/// begonnen wird, während der andere Standort inzwischen Master ist.
/// </summary>
public interface IRoleStateStore
{
    NodeRole LoadRole();

    void SaveRole(NodeRole role);
}
