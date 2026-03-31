"use client";

import { Business, BusinessPhoto, BusinessReview } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

type Props = {
  business: Business & { photos: BusinessPhoto[]; reviews: BusinessReview[] };
};

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`size-4 ${i < Math.round(rating) ? "text-yellow-400" : "text-muted-foreground/30"}`}
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

export function BusinessDetail({ business }: Props) {
  const priceLevelStr =
    business.price_level != null ? "$".repeat(business.price_level) : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{business.name}</h1>
          {priceLevelStr && (
            <span className="text-muted-foreground font-medium">
              {priceLevelStr}
            </span>
          )}
        </div>
        {business.all_categories.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {business.all_categories.map((cat) => (
              <Badge key={cat} variant="secondary">
                {cat}
              </Badge>
            ))}
          </div>
        )}
        {business.rating != null && (
          <div className="flex items-center gap-2">
            <StarRating rating={business.rating} />
            <span className="text-sm text-muted-foreground">
              {business.rating.toFixed(1)} ({business.reviews_count} reviews)
            </span>
          </div>
        )}
        {(business.temporarily_closed || business.permanently_closed) && (
          <Badge variant="destructive">
            {business.permanently_closed
              ? "Permanently Closed"
              : "Temporarily Closed"}
          </Badge>
        )}
      </div>

      {/* Contact */}
      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {business.formatted_address && (
            <div className="flex gap-2">
              <span className="text-muted-foreground w-28 shrink-0">
                Address
              </span>
              <span>{business.formatted_address}</span>
            </div>
          )}
          {business.phone && (
            <div className="flex gap-2">
              <span className="text-muted-foreground w-28 shrink-0">Phone</span>
              <span>{business.phone}</span>
            </div>
          )}
          {business.international_phone &&
            business.international_phone !== business.phone && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-28 shrink-0">
                  Intl. Phone
                </span>
                <span>{business.international_phone}</span>
              </div>
            )}
          {business.website_url && (
            <div className="flex gap-2">
              <span className="text-muted-foreground w-28 shrink-0">
                Website
              </span>
              <a
                href={business.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-3 hover:text-primary/80 break-all"
              >
                {business.website_url}
              </a>
            </div>
          )}
          {business.menu_url && (
            <div className="flex gap-2">
              <span className="text-muted-foreground w-28 shrink-0">Menu</span>
              <a
                href={business.menu_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-3 hover:text-primary/80 break-all"
              >
                {business.menu_url}
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hours */}
      {business.opening_hours && business.opening_hours.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
              {business.opening_hours.map((entry) => (
                <div key={entry.day} className="contents">
                  <span className="text-muted-foreground font-medium">
                    {entry.day}
                  </span>
                  <span>{entry.hours}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* About */}
      {business.about && Object.keys(business.about).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {Object.values(business.about)
                .flat()
                .map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Photos */}
      {business.photos.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Photos</h2>
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-3 pb-3">
              {business.photos.map((photo) => (
                <img
                  key={photo.id}
                  src={`/${photo.file_path}`}
                  alt={business.name}
                  className="h-48 w-72 shrink-0 rounded-lg object-cover"
                />
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      )}

      {/* Reviews */}
      {business.reviews.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">
            Reviews ({business.reviews.length})
          </h2>
          {business.reviews.map((review) => (
            <Card key={review.id}>
              <CardContent className="flex flex-col gap-2 pt-4 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{review.author}</span>
                  <span className="text-muted-foreground text-xs">
                    {review.date}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <StarRating rating={review.rating} />
                  {review.likes_count > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {review.likes_count} like
                      {review.likes_count !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                {review.text && (
                  <p className="text-muted-foreground leading-relaxed">
                    {review.text}
                  </p>
                )}
                {review.owner_reply && (
                  <div className="mt-1 border-l-2 border-border pl-3 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Owner reply
                    </span>
                    {review.owner_reply.date && (
                      <span className="ml-2 text-muted-foreground">
                        {review.owner_reply.date}
                      </span>
                    )}
                    <p className="mt-1 leading-relaxed">
                      {review.owner_reply.text}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Reserved for website project status integration */}
    </div>
  );
}
