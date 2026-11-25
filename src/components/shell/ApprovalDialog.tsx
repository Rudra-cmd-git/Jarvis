import { ShieldQuestion } from "lucide-react";
import { useApp } from "../../store/app-context";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

export function ApprovalDialog() {
  const { pendingApproval, resolveApproval } = useApp();
  const open = Boolean(pendingApproval);

  return (
    <Modal
      open={open}
      onClose={() => void resolveApproval(false)}
      title="Action requires your approval"
      description="JARVIS will not continue until you decide."
      footer={
        <>
          <Button variant="ghost" onClick={() => void resolveApproval(false)}>
            Deny
          </Button>
          <Button variant="primary" onClick={() => void resolveApproval(true)} autoFocus>
            Approve action
          </Button>
        </>
      }
    >
      {pendingApproval ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-amber/25 bg-amber/[0.06] p-3">
            <ShieldQuestion size={18} className="mt-0.5 shrink-0 text-amber" />
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-amber">{pendingApproval.tool}</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink">{pendingApproval.preview}</p>
            </div>
          </div>
          <div>
            <div className="label mb-1.5">Why JARVIS wants this</div>
            <p className="text-xs leading-relaxed text-muted">
              {pendingApproval.reason || "Requested by the assistant while handling your task."}
            </p>
          </div>
          <div>
            <div className="label mb-1.5">Exact arguments</div>
            <pre className="scroll-thin mono max-h-40 overflow-auto rounded-lg border border-line bg-black/40 p-3 text-[11px] leading-relaxed text-ink/90">
              {JSON.stringify(pendingApproval.args, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
