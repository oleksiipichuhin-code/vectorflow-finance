using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VectorFlow.Finance.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAccounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Accounts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    FinanceWorkspaceId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Code = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Type = table.Column<int>(type: "INTEGER", nullable: false),
                    Status = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    ArchivedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    CodeNormalized = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Accounts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Accounts_FinanceWorkspaces_FinanceWorkspaceId",
                        column: x => x.FinanceWorkspaceId,
                        principalTable: "FinanceWorkspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Accounts_FinanceWorkspaceId",
                table: "Accounts",
                column: "FinanceWorkspaceId");

            migrationBuilder.CreateIndex(
                name: "IX_Accounts_FinanceWorkspaceId_CodeNormalized",
                table: "Accounts",
                columns: new[] { "FinanceWorkspaceId", "CodeNormalized" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Accounts");
        }
    }
}
