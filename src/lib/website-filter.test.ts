import { describe, it, expect } from "vitest";
import { hasCustomWebsite } from "@/lib/website-filter";

describe("hasCustomWebsite", () => {
  describe("null / undefined / empty", () => {
    it("returns false for null", () => {
      expect(hasCustomWebsite(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(hasCustomWebsite(undefined)).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(hasCustomWebsite("")).toBe(false);
    });

    it("returns false for whitespace-only string", () => {
      expect(hasCustomWebsite("   ")).toBe(false);
    });
  });

  describe("Facebook URLs", () => {
    it("returns false for https://facebook.com/...", () => {
      expect(hasCustomWebsite("https://facebook.com/mybusiness")).toBe(false);
    });

    it("returns false for https://www.facebook.com/...", () => {
      expect(hasCustomWebsite("https://www.facebook.com/mybusiness")).toBe(false);
    });

    it("returns false for http://m.facebook.com/...", () => {
      expect(hasCustomWebsite("http://m.facebook.com/mybusiness")).toBe(false);
    });

    it("returns false for facebook.com without protocol", () => {
      expect(hasCustomWebsite("facebook.com/mybusiness")).toBe(false);
    });
  });

  describe("Instagram URLs", () => {
    it("returns false for https://instagram.com/...", () => {
      expect(hasCustomWebsite("https://instagram.com/mybusiness")).toBe(false);
    });

    it("returns false for https://www.instagram.com/...", () => {
      expect(hasCustomWebsite("https://www.instagram.com/mybusiness")).toBe(false);
    });

    it("returns false for instagram.com without protocol", () => {
      expect(hasCustomWebsite("instagram.com/mybusiness")).toBe(false);
    });
  });

  describe("other social / directory platforms", () => {
    it("returns false for twitter.com", () => {
      expect(hasCustomWebsite("https://twitter.com/mybusiness")).toBe(false);
    });

    it("returns false for x.com", () => {
      expect(hasCustomWebsite("https://x.com/mybusiness")).toBe(false);
    });

    it("returns false for tiktok.com", () => {
      expect(hasCustomWebsite("https://www.tiktok.com/@mybusiness")).toBe(false);
    });

    it("returns false for youtube.com", () => {
      expect(hasCustomWebsite("https://youtube.com/channel/abc")).toBe(false);
    });

    it("returns false for linkedin.com", () => {
      expect(hasCustomWebsite("https://linkedin.com/company/mybusiness")).toBe(false);
    });

    it("returns false for yelp.com", () => {
      expect(hasCustomWebsite("https://yelp.com/biz/mybusiness")).toBe(false);
    });

    it("returns false for tripadvisor.com", () => {
      expect(hasCustomWebsite("https://tripadvisor.com/Restaurant_Review")).toBe(false);
    });

    it("returns false for booking.com", () => {
      expect(hasCustomWebsite("https://booking.com/hotel/pl/myhotel")).toBe(false);
    });

    it("returns false for maps.google.com", () => {
      expect(hasCustomWebsite("https://maps.google.com/maps?cid=123")).toBe(false);
    });

    it("returns false for google.com", () => {
      expect(hasCustomWebsite("https://google.com/search?q=mybusiness")).toBe(false);
    });

    it("returns false for www.google.com", () => {
      expect(hasCustomWebsite("https://www.google.com/maps/place/abc")).toBe(false);
    });

    it("returns false for foursquare.com", () => {
      expect(hasCustomWebsite("https://foursquare.com/v/mybusiness")).toBe(false);
    });

    it("returns false for zomato.com", () => {
      expect(hasCustomWebsite("https://zomato.com/pl/warsaw/mybusiness")).toBe(false);
    });

    it("returns false for ubereats.com", () => {
      expect(hasCustomWebsite("https://ubereats.com/store/mybusiness")).toBe(false);
    });

    it("returns false for doordash.com", () => {
      expect(hasCustomWebsite("https://doordash.com/store/mybusiness")).toBe(false);
    });

    it("returns false for grubhub.com", () => {
      expect(hasCustomWebsite("https://grubhub.com/restaurant/mybusiness")).toBe(false);
    });

    it("returns false for pyszne.pl", () => {
      expect(hasCustomWebsite("https://pyszne.pl/restaurant/mybusiness")).toBe(false);
    });

    it("returns false for allegro.pl", () => {
      expect(hasCustomWebsite("https://allegro.pl/uzytkownik/myshop")).toBe(false);
    });

    it("returns false for olx.pl", () => {
      expect(hasCustomWebsite("https://olx.pl/oferty/uzytkownik/myshop")).toBe(false);
    });

    it("returns false for pinterest.com", () => {
      expect(hasCustomWebsite("https://pinterest.com/mybusiness")).toBe(false);
    });

    it("returns false for tumblr.com", () => {
      expect(hasCustomWebsite("https://mybusiness.tumblr.com")).toBe(false);
    });

    it("returns false for reddit.com", () => {
      expect(hasCustomWebsite("https://reddit.com/r/mybusiness")).toBe(false);
    });

    it("returns false for yellowpages.com", () => {
      expect(hasCustomWebsite("https://yellowpages.com/search?terms=mybusiness")).toBe(false);
    });

    it("returns false for bing.com", () => {
      expect(hasCustomWebsite("https://bing.com/search?q=mybusiness")).toBe(false);
    });
  });

  describe("custom domains", () => {
    it("returns true for a plain custom domain", () => {
      expect(hasCustomWebsite("https://mybusiness.com")).toBe(true);
    });

    it("returns true for a custom domain with www", () => {
      expect(hasCustomWebsite("https://www.mybusiness.pl")).toBe(true);
    });

    it("returns true for a custom domain without protocol", () => {
      expect(hasCustomWebsite("mybusiness.com")).toBe(true);
    });

    it("returns true for a custom domain with path", () => {
      expect(hasCustomWebsite("https://restauracja-smaczna.pl/menu")).toBe(true);
    });

    it("returns true for a subdomain of a custom domain", () => {
      expect(hasCustomWebsite("https://shop.mybrand.com")).toBe(true);
    });
  });

  describe("URLs without protocol", () => {
    it("returns false for facebook.com without protocol", () => {
      expect(hasCustomWebsite("facebook.com")).toBe(false);
    });

    it("returns false for www.instagram.com without protocol", () => {
      expect(hasCustomWebsite("www.instagram.com/profile")).toBe(false);
    });

    it("returns true for a custom domain without protocol", () => {
      expect(hasCustomWebsite("mycafe.pl")).toBe(true);
    });
  });
});
