import { writeFileSync } from "fs";
const hook = [
`      });`,
``,
`      // #104 — once approval is durable, commit inventory reservations. The`,
`      // function writes one InventoryMovement ledger row per inventory-linked`,
`      // Part, keyed per part so retries cannot double-reserve.`,
`      try {`,
`        const reservation = await base44.functions.invoke("inventoryAction", {`,
`          session_token: sessionToken,`,
`          action: "reserve_for_estimate",`,
`          estimate_id: estimate.id,`,
`          creation_request_key: \`approve_reserve:\${estimate.id}\`,`,
`        });`,
`        const data = reservation?.data || reservation;`,
`        if (data?.skipped_count > 0) {`,
`          window.alert(\`Quote approved. \${data.reserved_count || 0} stock item(s) reserved; \${data.skipped_count} skipped — review the Movement log on the Inventory page.\`);`,
`        }`,
`      } catch {`,
`        window.alert("Quote approved, but stock reservation could not be completed. Review the Inventory Movement log before issuing material.");`,
`      }`,
`    } catch (error) {`,
`      const reflected`,
].join("\n");
const edits = [
  {
    old_text: "      });\n    } catch (error) {\n      const reflected",
    new_text: hook,
  },
];
writeFileSync(".edits-ed104.json", JSON.stringify(edits));
console.log("ok");
