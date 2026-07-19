using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VectorFlow.Finance.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddLedgerPostings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "LedgerPostings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    FinanceWorkspaceId = table.Column<Guid>(type: "TEXT", nullable: false),
                    JournalEntryId = table.Column<Guid>(type: "TEXT", nullable: false),
                    PostedAtUtc = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LedgerPostings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LedgerPostings_FinanceWorkspaces_FinanceWorkspaceId",
                        column: x => x.FinanceWorkspaceId,
                        principalTable: "FinanceWorkspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_LedgerPostings_JournalEntries_JournalEntryId",
                        column: x => x.JournalEntryId,
                        principalTable: "JournalEntries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "LedgerPostingLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    SourceJournalEntryLineId = table.Column<Guid>(type: "TEXT", nullable: false),
                    FinancialAccountId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Debit = table.Column<decimal>(type: "TEXT", nullable: false),
                    Credit = table.Column<decimal>(type: "TEXT", nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    Sequence = table.Column<int>(type: "INTEGER", nullable: false),
                    LedgerPostingId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LedgerPostingLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LedgerPostingLines_Accounts_FinancialAccountId",
                        column: x => x.FinancialAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_LedgerPostingLines_LedgerPostings_LedgerPostingId",
                        column: x => x.LedgerPostingId,
                        principalTable: "LedgerPostings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_LedgerPostingLines_FinancialAccountId",
                table: "LedgerPostingLines",
                column: "FinancialAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_LedgerPostingLines_LedgerPostingId",
                table: "LedgerPostingLines",
                column: "LedgerPostingId");

            migrationBuilder.CreateIndex(
                name: "IX_LedgerPostingLines_LedgerPostingId_Sequence",
                table: "LedgerPostingLines",
                columns: new[] { "LedgerPostingId", "Sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LedgerPostingLines_LedgerPostingId_SourceJournalEntryLineId",
                table: "LedgerPostingLines",
                columns: new[] { "LedgerPostingId", "SourceJournalEntryLineId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LedgerPostings_FinanceWorkspaceId",
                table: "LedgerPostings",
                column: "FinanceWorkspaceId");

            migrationBuilder.CreateIndex(
                name: "IX_LedgerPostings_FinanceWorkspaceId_PostedAtUtc",
                table: "LedgerPostings",
                columns: new[] { "FinanceWorkspaceId", "PostedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_LedgerPostings_JournalEntryId",
                table: "LedgerPostings",
                column: "JournalEntryId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LedgerPostingLines");

            migrationBuilder.DropTable(
                name: "LedgerPostings");
        }
    }
}
