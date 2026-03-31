"use client";

import * as React from "react";
import Link from "next/link";
import { Business } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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

interface BusinessTableProps {
  businesses: Business[];
  onDelete: (id: string) => void;
}

export function BusinessTable({ businesses, onDelete }: BusinessTableProps) {
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);

  function handleConfirmDelete() {
    if (pendingDeleteId) {
      onDelete(pendingDeleteId);
      setPendingDeleteId(null);
    }
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>Rating</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {businesses.map((business) => (
            <TableRow key={business.id}>
              <TableCell>
                <Link
                  href={`/businesses/${business.id}`}
                  className="text-primary underline-offset-4 hover:underline font-medium"
                >
                  {business.name}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{business.category}</Badge>
              </TableCell>
              <TableCell className="max-w-48 truncate text-muted-foreground">
                {business.formatted_address || business.address || "—"}
              </TableCell>
              <TableCell>
                {business.rating != null ? (
                  <span className="flex items-center gap-1">
                    <span className="text-yellow-500">★</span>
                    {business.rating.toFixed(1)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {business.phone ?? business.international_phone ?? "—"}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setPendingDeleteId(business.id)}
                >
                  ✕
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={pendingDeleteId !== null} onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete Business</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this business? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
