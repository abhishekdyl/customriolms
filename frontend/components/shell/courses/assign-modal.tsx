"use client";
import { useState } from "react";
import { Check, BookOpen } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTeams } from "@/lib/hooks/use-teams";
import { useUsers } from "@/lib/hooks/use-users";
import { useCourses, useAssignCourse, useBulkAssignCourses } from "@/lib/hooks/use-courses";

/**
 * Ported from AssignCourseModal in lms_screens.jsx — single course,
 * preselected course, or a bulk list from the Courses list's select
 * mode all go through this one component.
 *
 * Note: the "due date" field is UI-only for now. CourseAssignRequest on
 * the backend doesn't have a due_date column yet, so it's collected but
 * not sent or persisted — kept here because the prototype has it and
 * removing it silently would be more confusing than a field that
 * visibly doesn't do anything yet.
 */
export function AssignModal({
  courseId,
  courseIds,
  onClose,
}: {
  courseId?: string;
  courseIds?: string[];
  onClose: () => void;
}) {
  const { data: allCourses } = useCourses();
  const { data: teams } = useTeams();
  const { data: users } = useUsers();

  const bulkIds = courseIds && courseIds.length > 1 ? courseIds : null;
  const hasPreselection = !!(courseIds && courseIds.length > 0) || !!courseId;
  const [pickedCourseId, setPickedCourseId] = useState(courseId || courseIds?.[0] || "");
  const [target, setTarget] = useState<"teams" | "users">("teams");
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [done, setDone] = useState(false);

  const showCoursePicker = !hasPreselection;
  const targetCourseIds = bulkIds || [pickedCourseId];

  const assignOne = useAssignCourse(pickedCourseId);
  const assignBulk = useBulkAssignCourses();
  const isPending = assignOne.isPending || assignBulk.isPending;

  const toggle = (list: string[], setList: (v: string[]) => void, id: string) =>
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const course = allCourses?.find((c) => c.id === pickedCourseId);
  const recipientCount = teamIds.length + userIds.length;

  const submit = () => {
    if (recipientCount === 0) return;
    const onSuccess = () => {
      setDone(true);
      setTimeout(onClose, 1100);
    };
    if (bulkIds) {
      assignBulk.mutate({ course_ids: targetCourseIds, team_ids: teamIds, user_ids: userIds }, { onSuccess });
    } else {
      assignOne.mutate({ team_ids: teamIds, user_ids: userIds }, { onSuccess });
    }
  };

  const open = !!courseId || !!(courseIds && courseIds.length > 0);

  if (done) {
    return (
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent>
          <div className="flex flex-col items-center p-8 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-soft">
              <Check className="h-5 w-5 text-success" />
            </div>
            <div className="mb-1 font-head text-base text-ink">Assigned</div>
            <div className="text-xs text-ink-faint">
              {bulkIds ? `${bulkIds.length} courses` : course?.title} now assigned to {recipientCount} recipient{recipientCount !== 1 ? "s" : ""}.
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{bulkIds ? `Assign ${bulkIds.length} courses` : "Assign course"}</DialogTitle>
        </DialogHeader>
        <div className="p-6">
          {showCoursePicker && (
            <div className="mb-4">
              <p className="mb-1.5 text-[11.5px] text-ink-soft">Course</p>
              <select
                value={pickedCourseId}
                onChange={(e) => setPickedCourseId(e.target.value)}
                className="w-full rounded-md border border-line px-2.5 py-2 text-sm"
              >
                {allCourses?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
          )}
          {!showCoursePicker && !bulkIds && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-primary-soft px-3 py-2.5">
              <BookOpen className="h-3.5 w-3.5 text-primary" />
              <span className="text-[12.5px] font-medium text-ink">{course?.title}</span>
            </div>
          )}
          {bulkIds && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {bulkIds.map((id) => {
                const c = allCourses?.find((x) => x.id === id);
                return (
                  <span key={id} className="rounded-full bg-primary-soft px-2.5 py-1 text-[11.5px] font-medium text-primary">
                    {c?.title}
                  </span>
                );
              })}
            </div>
          )}

          <div className="mb-4 flex rounded-lg bg-line-soft p-1">
            {(["teams", "users"] as const).map((id) => (
              <button
                key={id}
                onClick={() => setTarget(id)}
                className={`flex-1 rounded-md py-2 text-[12.5px] ${target === id ? "bg-surface font-semibold text-ink" : "text-ink-faint"}`}
              >
                {id === "teams" ? "Teams" : "Individuals"}
              </button>
            ))}
          </div>

          {target === "teams" ? (
            <div className="mb-5 flex flex-wrap gap-2">
              {teams?.map((t) => (
                <button
                  key={t.id}
                  onClick={() => toggle(teamIds, setTeamIds, t.id)}
                  className={`rounded-full border px-3.5 py-2 text-[12.5px] ${
                    teamIds.includes(t.id) ? "border-primary bg-primary-soft font-semibold text-primary" : "border-line text-ink-soft"
                  }`}
                >
                  {t.name}
                </button>
              ))}
              {teams?.length === 0 && <p className="text-xs text-ink-faint">No teams yet.</p>}
            </div>
          ) : (
            <div className="mb-5 flex max-h-[200px] flex-col gap-1.5 overflow-auto">
              {users?.map((u) => (
                <button
                  key={u.id}
                  onClick={() => toggle(userIds, setUserIds, u.id)}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left ${userIds.includes(u.id) ? "bg-primary-soft" : ""}`}
                >
                  <span
                    className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded"
                    style={{ border: `1.5px solid ${userIds.includes(u.id) ? "var(--color-primary)" : "var(--color-line)"}`, background: userIds.includes(u.id) ? "var(--color-primary)" : "transparent" }}
                  >
                    {userIds.includes(u.id) && <Check className="h-2.5 w-2.5 text-white" />}
                  </span>
                  <span className="text-sm text-ink">{u.full_name}</span>
                  {u.team_name && <span className="text-[11px] text-ink-faint">· {u.team_name}</span>}
                </button>
              ))}
              {users?.length === 0 && <p className="text-xs text-ink-faint">No learners yet.</p>}
            </div>
          )}

          <div className="mb-6">
            <p className="mb-1.5 text-[11.5px] text-ink-soft">Due date (optional)</p>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-md border border-line px-2.5 py-2 text-sm"
            />
          </div>

          <button
            onClick={submit}
            disabled={recipientCount === 0 || isPending}
            className={`w-full rounded-lg py-3 text-[13.5px] font-semibold text-white ${recipientCount === 0 ? "bg-line text-ink-faint" : "bg-primary"}`}
          >
            {isPending ? "Assigning…" : `Assign to ${recipientCount || ""} ${target === "teams" ? "team" : "learner"}${recipientCount !== 1 ? "s" : ""}`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
