"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Module, QuestionInput, QuizQuestion } from "@/lib/types";

export interface QuestionBankListItem {
  id: string;
  name: string;
  description: string | null;
  question_count: number;
  created_at: string;
}

export interface QuestionBank {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  questions: QuizQuestion[];
}

export function useQuestionBanks() {
  return useQuery({
    queryKey: ["question-banks"],
    queryFn: () => api.get<QuestionBankListItem[]>("/api/v1/question-banks"),
  });
}

export function useQuestionBank(id: string | null) {
  return useQuery({
    queryKey: ["question-banks", id],
    queryFn: () => api.get<QuestionBank>(`/api/v1/question-banks/${id}`),
    enabled: !!id,
  });
}

export function useCreateQuestionBank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string | null }) =>
      api.post<QuestionBank>("/api/v1/question-banks", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["question-banks"] }),
  });
}

export function useUpdateQuestionBank(bankId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; description?: string | null }) =>
      api.patch<QuestionBank>(`/api/v1/question-banks/${bankId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["question-banks"] });
      qc.invalidateQueries({ queryKey: ["question-banks", bankId] });
    },
  });
}

export function useDeleteQuestionBank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bankId: string) => api.delete(`/api/v1/question-banks/${bankId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["question-banks"] }),
  });
}

export function useAddBankQuestion(bankId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: QuestionInput) => api.post<QuizQuestion>(`/api/v1/question-banks/${bankId}/questions`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["question-banks", bankId] });
      qc.invalidateQueries({ queryKey: ["question-banks"] });
    },
  });
}

export function useUpdateBankQuestion(bankId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ questionId, ...body }: { questionId: string } & QuestionInput) =>
      api.patch<QuizQuestion>(`/api/v1/question-banks/${bankId}/questions/${questionId}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["question-banks", bankId] }),
  });
}

export function useDeleteBankQuestion(bankId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (questionId: string) => api.delete(`/api/v1/question-banks/${bankId}/questions/${questionId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["question-banks", bankId] });
      qc.invalidateQueries({ queryKey: ["question-banks"] });
    },
  });
}

/** Copies selected bank questions onto the end of a module's own question
 * list — a copy, never a live reference (see question_bank_service.py). */
export function useImportBankQuestions(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bankId, moduleId, questionIds }: { bankId: string; moduleId: string; questionIds: string[] }) =>
      api.post<Module>(`/api/v1/question-banks/${bankId}/import-into/${courseId}/${moduleId}`, { question_ids: questionIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses", courseId] }),
  });
}

/** Uploads a question/option image once, up front — the returned
 * image_key is then embedded into whichever QuestionInput the admin is
 * authoring (bank question or module question). */
export function useUploadQuestionImage() {
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return api.upload<{ image_key: string; image_url: string | null }>("/api/v1/question-banks/images", formData);
    },
  });
}
