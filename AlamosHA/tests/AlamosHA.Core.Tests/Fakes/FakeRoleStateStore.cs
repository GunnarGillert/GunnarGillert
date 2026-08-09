using AlamosHA.Core.Abstractions;
using AlamosHA.Core.Models;

namespace AlamosHA.Core.Tests.Fakes;

public sealed class FakeRoleStateStore : IRoleStateStore
{
    private NodeRole _role;

    public FakeRoleStateStore(NodeRole initialRole = NodeRole.Unknown)
    {
        _role = initialRole;
    }

    public List<NodeRole> SavedRoles { get; } = new();

    public NodeRole LoadRole() => _role;

    public void SaveRole(NodeRole role)
    {
        _role = role;
        SavedRoles.Add(role);
    }
}
