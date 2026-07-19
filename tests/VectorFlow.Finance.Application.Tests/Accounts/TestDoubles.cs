using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accounts;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Tests.Accounts;

internal sealed class FixedClock : IClock
{
    public FixedClock(DateTimeOffset utcNow)
    {
        UtcNow = utcNow;
    }

    public DateTimeOffset UtcNow { get; set; }
}

internal sealed class InMemoryAccountRepository : IAccountRepository
{
    private readonly Dictionary<Guid, Account> _byId = new();
    private readonly Dictionary<(Guid WorkspaceId, string CodeKey), Guid> _byWorkspaceAndCode = new(
        new WorkspaceCodeComparer());

    public int SaveChangesCallCount { get; private set; }

    public int AddCallCount { get; private set; }

    public Task<Account?> GetByIdAsync(
        FinanceWorkspaceId financeWorkspaceId,
        AccountId id,
        CancellationToken cancellationToken = default)
    {
        if (_byId.TryGetValue(id.Value, out var account)
            && account.FinanceWorkspaceId == financeWorkspaceId)
        {
            return Task.FromResult<Account?>(account);
        }

        return Task.FromResult<Account?>(null);
    }

    public Task<Account?> GetByWorkspaceAndCodeAsync(
        FinanceWorkspaceId financeWorkspaceId,
        AccountCode code,
        CancellationToken cancellationToken = default)
    {
        if (_byWorkspaceAndCode.TryGetValue((financeWorkspaceId.Value, code.Value), out var id))
        {
            return Task.FromResult<Account?>(_byId[id]);
        }

        return Task.FromResult<Account?>(null);
    }

    public Task AddAsync(Account account, CancellationToken cancellationToken = default)
    {
        AddCallCount++;
        Index(account);
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        SaveChangesCallCount++;

        // Re-index after mutations (e.g. ChangeCode) so lookups stay consistent.
        _byWorkspaceAndCode.Clear();
        foreach (var account in _byId.Values)
        {
            _byWorkspaceAndCode[(account.FinanceWorkspaceId.Value, account.Code.Value)] = account.Id.Value;
        }

        return Task.CompletedTask;
    }

    private void Index(Account account)
    {
        _byId[account.Id.Value] = account;
        _byWorkspaceAndCode[(account.FinanceWorkspaceId.Value, account.Code.Value)] = account.Id.Value;
    }

    private sealed class WorkspaceCodeComparer : IEqualityComparer<(Guid WorkspaceId, string CodeKey)>
    {
        public bool Equals((Guid WorkspaceId, string CodeKey) x, (Guid WorkspaceId, string CodeKey) y) =>
            x.WorkspaceId == y.WorkspaceId
            && string.Equals(x.CodeKey, y.CodeKey, StringComparison.OrdinalIgnoreCase);

        public int GetHashCode((Guid WorkspaceId, string CodeKey) obj) =>
            HashCode.Combine(obj.WorkspaceId, StringComparer.OrdinalIgnoreCase.GetHashCode(obj.CodeKey));
    }
}
