import type { ProfileSearchResult, Tag } from "@matcha/shared";

export function discoveryFixtures(tags: Tag[]): ProfileSearchResult[] {
  return ["Sam", "Noor", "Robin", "Camille", "Amine", "Jules", "Aya", "Sacha", "Lina", "Yanis", "Lou", "Adam", "Maya", "Rayan", "Ines", "Eden"].map((name, index) => ({
    id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, username: `browse_demo_${index + 1}`, firstName: name, lastName: "Example",
    gender: "non_binary", sexualPreference: "everyone", bio: "A synthetic profile for reviewing Matcha. Books, walks and weekend discoveries.",
    age: 23 + index, fameRating: (index * 13 + 12) % 101, distanceKm: index * 4 + 2, commonTags: index % 4,
    location: { city: index % 2 ? "Rabat" : "Casablanca", neighborhood: null },
    tags: tags.filter((_, tagIndex) => tagIndex % 4 === index % 4),
    pictures: [{ id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, url: `http://localhost:3000/api/profile/pictures/20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, isMain: true, position: 1 }],
    isOnline: false, lastSeen: null, likedByMe: false, hasLikedMe: false, isConnected: false,
  }));
}

export function discoveryPicture(id: string): Blob | null {
  if (!/^20000000-0000-4000-8000-\d{12}$/.test(id) || Number(id.slice(-12)) < 1 || Number(id.slice(-12)) > 16) return null;
  const png = "iVBORw0KGgoAAAANSUhEUgAAAGAAAABgAQMAAADYVuV7AAAABlBMVEXT5d9mdW4b1kBQAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAjUlEQVQ4jeXRuw3EIBCEYRABISVQCqX5SrtSXILDCyz/J3sQXguT32Oi/RK0Ozj3X8mrwcQ5e3g2BJgbIiwNCV7nY7Deo8B2jwn4IJThonl4XLIdRNtOsL1526izXbvLL/xWOPI4Zi+ohSConygsPZKggrOgtoqw9dh/dE+POmufIeqe2nSMeoFu+BK8AQTYWQ/4thvqAAAAAElFTkSuQmCC";
  return new Blob([Uint8Array.from(atob(png), character => character.charCodeAt(0))], { type: "image/png" });
}
