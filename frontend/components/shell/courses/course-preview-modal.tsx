"use client";
import { Construction } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCourse } from "@/lib/hooks/use-courses";

export function CoursePreviewModal({ courseId, onClose }: { courseId: string; onClose: () => void }) {
  const { data: course } = useCourse(courseId);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{course?.title ?? "Preview"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center p-8 text-center">
          <Construction className="mb-3 h-7 w-7 text-ink-faint" />
          <p className="mb-1 text-sm text-ink">The learner course player isn&apos;t built yet</p>
          <p className="text-xs text-ink-faint">
            This will show the video/quiz/read flow a learner sees, module by module. For now you can review the
            module list and content from the Manage screen.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
