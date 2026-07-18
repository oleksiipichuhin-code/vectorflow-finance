using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VectorFlow.Finance.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialFinanceWorkspace : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FinanceWorkspaces",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    PlatformOrganizationId = table.Column<Guid>(type: "TEXT", nullable: false),
                    PlatformWorkspaceId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    DefaultCurrency = table.Column<string>(type: "TEXT", maxLength: 16, nullable: false),
                    Status = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FinanceWorkspaces", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_FinanceWorkspaces_PlatformOrganizationId_PlatformWorkspaceId",
                table: "FinanceWorkspaces",
                columns: new[] { "PlatformOrganizationId", "PlatformWorkspaceId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FinanceWorkspaces");
        }
    }
}
