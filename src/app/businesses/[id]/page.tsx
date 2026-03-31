"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Business, BusinessPhoto, BusinessReview } from "@/lib/types";
import { BusinessDetail } from "@/components/business-detail";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowLeftIcon, Trash2Icon } from "lucide-react";

type BusinessWithMedia = Business & {
  photos: BusinessPhoto[];
  reviews: BusinessReview[];
};

export default function BusinessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [business, setBusiness] = useState<BusinessWithMedia | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function fetchBusiness() {
      setLoading(true);
      try {
        const res = await fetch(`/api/businesses/${id}`);
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error("Failed to fetch business");
        const data = (await res.json()) as BusinessWithMedia;
        setBusiness(data);
      } catch (err) {
        console.error(err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }

    fetchBusiness();
  }, [id]);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/businesses/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete business");
      router.push("/businesses");
    } catch (err) {
      console.error(err);
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeftIcon />
          Back
        </Button>

        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger
            render={
              <Button variant="destructive" size="sm" disabled={loading || notFound} />
            }
          >
            <Trash2Icon />
            Delete
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete business?</DialogTitle>
              <DialogDescription>
                This will permanently delete{" "}
                <strong>{business?.name ?? "this business"}</strong> and all
                associated photos and reviews. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Content */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : notFound ? (
        <p className="text-sm text-muted-foreground">Business not found.</p>
      ) : business ? (
        <BusinessDetail business={business} />
      ) : null}
    </div>
  );
}
