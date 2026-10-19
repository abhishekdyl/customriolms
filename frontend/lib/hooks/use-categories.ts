"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Category } from "@/lib/types";

export function useCategories() {
  return useQuery({ queryKey: ["categories"], queryFn: () => api.get<Category[]>("/api/v1/categories") });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; color: string }) => api.post<Category>("/api/v1/categories", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name: string; color: string }) =>
      api.patch<Category>(`/api/v1/categories/${id}`, body),
    // CourseListItem/Course both carry a denormalized category_name, so a
    // rename here must invalidate the courses list/detail too — otherwise
    // the courses page keeps showing the old name until its own cache
    // happens to expire (staleTime) or something else invalidates it.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["courses"] });
    },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/categories/${id}`),
    // The backend reassigns that category's courses to Uncategorized
    // rather than deleting them, so the courses list's category_name/
    // category_id must refresh too.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["courses"] });
    },
  });
}
