import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { hash } from "bcryptjs";

const url = new URL(process.env.DATABASE_URL!);
const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port) || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  connectionLimit: 5,
  allowPublicKeyRetrieval: true,
});
const prisma = new PrismaClient({ adapter });

const categories = [
  { name: "Szépirodalom", slug: "szepirodalmi", icon: "📚", color: "#8B4513", order: 1, description: "Regény, novella, elbeszélés" },
  { name: "Ismeretterjesztő", slug: "ismeretterjeszto", icon: "🔬", color: "#2F4F4F", order: 2, description: "Tudományos és ismeretterjesztő könyvek" },
  { name: "Történelem", slug: "tortenetkezes", icon: "🏛️", color: "#704214", order: 3, description: "Történelmi témájú könyvek" },
  { name: "Informatika", slug: "informatika", icon: "💻", color: "#1C3A5F", order: 4, description: "Programozás, technológia, IT" },
  { name: "Nyelvkönyv", slug: "nyelvkonyv", icon: "🌍", color: "#556B2F", order: 5, description: "Nyelvtanulás és nyelvkönyv" },
  { name: "Gyermekirodalom", slug: "gyermekirodalom", icon: "🧸", color: "#800020", order: 6, description: "Mese, ifjúsági irodalom" },
  { name: "Életrajz", slug: "eletrajz", icon: "👤", color: "#4B0082", order: 7, description: "Életrajzok és memoárok" },
  { name: "Filozófia", slug: "filozofia", icon: "🤔", color: "#483D8B", order: 8, description: "Filozófia és gondolkodás" },
];

const topics = [
  { name: "Krimi", slug: "krimi", color: "#DC2626" },
  { name: "Sci-fi", slug: "sci-fi", color: "#7C3AED" },
  { name: "Fantasy", slug: "fantasy", color: "#059669" },
  { name: "Romantikus", slug: "romantikus", color: "#EC4899" },
  { name: "Thriller", slug: "thriller", color: "#F59E0B" },
  { name: "Horror", slug: "horror", color: "#1F2937" },
  { name: "Python", slug: "python", color: "#3B82F6" },
  { name: "JavaScript", slug: "javascript", color: "#EAB308" },
  { name: "React", slug: "react", color: "#06B6D4" },
  { name: "AI/ML", slug: "ai-ml", color: "#8B5CF6" },
  { name: "Klasszikus", slug: "klasszikus", color: "#92400E" },
  { name: "Modern", slug: "modern", color: "#0891B2" },
  { name: "Magyar", slug: "magyar", color: "#16A34A" },
  { name: "Angol", slug: "angol", color: "#2563EB" },
  { name: "Német", slug: "nemet", color: "#DC2626" },
];

const demoUsers = [
  { name: "Demo Admin", email: "admin@demo.hu", password: "Admin123!", role: "ADMIN" as const },
  { name: "Kovács Anna", email: "anna@demo.hu", password: "Demo1234!", role: "USER" as const },
  { name: "Nagy Péter", email: "peter@demo.hu", password: "Demo1234!", role: "USER" as const },
];

const demoBooks = [
  {
    title: "A láthatatlan ember",
    author: "H.G. Wells",
    description: "Egy tudós felfedezi a láthatatlanság titkát, de az átok lesz számára. Klasszikus sci-fi regény, amely az emberi természet sötét oldalát tárja fel.",
    originalFormat: "epub",
    fileSize: 524288,
    language: "hu",
    pageCount: 210,
    categories: ["szepirodalmi"],
    topics: ["sci-fi", "klasszikus"],
  },
  {
    title: "JavaScript: The Good Parts",
    author: "Douglas Crockford",
    description: "A JavaScript nyelv legjobb részeinek bemutatása. Nélkülözhetetlen olvasmány minden webfejlesztőnek.",
    originalFormat: "epub",
    fileSize: 1048576,
    language: "en",
    pageCount: 176,
    categories: ["informatika"],
    topics: ["javascript"],
  },
  {
    title: "Egri csillagok",
    author: "Gárdonyi Géza",
    description: "A magyar irodalom egyik legismertebb regénye az egri vár 1552-es ostromáról. Bornemissza Gergely és Cecey Éva szerelmi története a történelem viharában.",
    originalFormat: "epub",
    fileSize: 786432,
    language: "hu",
    pageCount: 420,
    categories: ["szepirodalmi", "tortenetkezes"],
    topics: ["klasszikus", "magyar"],
  },
  {
    title: "Clean Code",
    author: "Robert C. Martin",
    description: "A tiszta kód írásának művészete. Gyakorlati tanácsok és elvek, amelyek segítenek jobb szoftvert írni.",
    originalFormat: "pdf",
    fileSize: 2097152,
    language: "en",
    pageCount: 464,
    categories: ["informatika"],
    topics: ["javascript", "python"],
  },
  {
    title: "Gyűrűk Ura: A Gyűrű Szövetsége",
    author: "J.R.R. Tolkien",
    description: "A fantasy irodalom alapműve. Frodó és társai elindulnak, hogy elpusztítsák az Egy Gyűrűt.",
    originalFormat: "epub",
    fileSize: 1572864,
    language: "hu",
    pageCount: 576,
    categories: ["szepirodalmi"],
    topics: ["fantasy", "klasszikus"],
  },
  {
    title: "A kis herceg",
    author: "Antoine de Saint-Exupéry",
    description: "Egy pilóta találkozik a kis herceggel a Szaharában. Időtlen mese a barátságról, szerelemről és az élet értelméről.",
    originalFormat: "epub",
    fileSize: 262144,
    language: "hu",
    pageCount: 96,
    categories: ["gyermekirodalom", "szepirodalmi"],
    topics: ["klasszikus", "magyar"],
  },
];

const demoReviews = [
  { bookIndex: 0, userIndex: 1, rating: 5, text: "Fantasztikus klasszikus! Wells zseniális író." },
  { bookIndex: 0, userIndex: 2, rating: 4, text: "Nagyon jó, bár a vége kicsit elnyújtott." },
  { bookIndex: 2, userIndex: 1, rating: 5, text: "Minden magyar ember kötelező olvasmánya!" },
  { bookIndex: 2, userIndex: 2, rating: 5, text: "Gyerekkorom kedvence, most újraolvastam." },
  { bookIndex: 4, userIndex: 1, rating: 5, text: "A legjobb fantasy valaha. Tolkien egy zseni." },
  { bookIndex: 5, userIndex: 2, rating: 5, text: "Gyönyörű és mély. Mindig megkönnyezem." },
  { bookIndex: 1, userIndex: 2, rating: 4, text: "Hasznos könyv, de néhol elavult." },
  { bookIndex: 3, userIndex: 1, rating: 4, text: "Kötelező olvasmány minden fejlesztőnek." },
];

async function main() {
  console.log("Seeding database...");

  // Upsert categories
  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: cat,
      create: cat,
    });
  }
  console.log(`Seeded ${categories.length} categories`);

  // Upsert topics
  for (const topic of topics) {
    await prisma.topic.upsert({
      where: { slug: topic.slug },
      update: topic,
      create: topic,
    });
  }
  console.log(`Seeded ${topics.length} topics`);

  // Check if demo flag is set
  const seedDemo = process.argv.includes("--demo");
  if (!seedDemo) {
    console.log("Seeding complete! (Use --demo flag for demo users/books/reviews)");
    return;
  }

  console.log("Seeding demo data...");

  // Create demo users
  const users = [];
  for (const u of demoUsers) {
    const hashedPw = await hash(u.password, 12);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role },
      create: {
        name: u.name,
        email: u.email,
        password: hashedPw,
        role: u.role,
      },
    });
    users.push(user);
  }
  console.log(`Seeded ${users.length} demo users`);

  // Fetch category/topic IDs
  const allCats = await prisma.category.findMany();
  const allTopics = await prisma.topic.findMany();
  const catMap = new Map(allCats.map((c) => [c.slug, c.id]));
  const topicMap = new Map(allTopics.map((t) => [t.slug, t.id]));

  // Create demo books (owned by different users)
  const books = [];
  for (let i = 0; i < demoBooks.length; i++) {
    const b = demoBooks[i];
    const ownerIndex = i % users.length;

    // Check if book already exists by title + user
    const existing = await prisma.book.findFirst({
      where: { title: b.title, userId: users[ownerIndex].id },
    });

    if (existing) {
      books.push(existing);
      continue;
    }

    const book = await prisma.book.create({
      data: {
        title: b.title,
        author: b.author,
        description: b.description,
        originalFormat: b.originalFormat,
        fileUrl: `/demo/${b.title.toLowerCase().replace(/\s+/g, "-")}.${b.originalFormat}`,
        fileSize: b.fileSize,
        language: b.language,
        pageCount: b.pageCount,
        userId: users[ownerIndex].id,
        downloadCount: Math.floor(Math.random() * 50),
        viewCount: Math.floor(Math.random() * 200) + 10,
        categories: {
          create: b.categories
            .map((slug) => catMap.get(slug))
            .filter(Boolean)
            .map((categoryId) => ({ categoryId: categoryId! })),
        },
        topics: {
          create: b.topics
            .map((slug) => topicMap.get(slug))
            .filter(Boolean)
            .map((topicId) => ({ topicId: topicId! })),
        },
      },
    });
    books.push(book);
  }
  console.log(`Seeded ${books.length} demo books`);

  // Create demo reviews
  let reviewCount = 0;
  for (const r of demoReviews) {
    const book = books[r.bookIndex];
    const user = users[r.userIndex];
    if (!book || !user) continue;

    await prisma.review.upsert({
      where: { userId_bookId: { userId: user.id, bookId: book.id } },
      update: { rating: r.rating, text: r.text },
      create: {
        userId: user.id,
        bookId: book.id,
        rating: r.rating,
        text: r.text,
      },
    });
    reviewCount++;
  }
  console.log(`Seeded ${reviewCount} demo reviews`);

  // Create some likes
  let likeCount = 0;
  for (let i = 0; i < books.length; i++) {
    for (let j = 1; j < users.length; j++) {
      if (Math.random() > 0.4) {
        try {
          await prisma.like.create({
            data: { userId: users[j].id, bookId: books[i].id },
          });
          likeCount++;
        } catch {
          // Already exists
        }
      }
    }
  }
  console.log(`Seeded ${likeCount} demo likes`);

  // Create demo shelves
  const shelf = await prisma.shelf.upsert({
    where: { id: "demo-shelf-kedvencek" },
    update: {},
    create: {
      id: "demo-shelf-kedvencek",
      name: "Kedvencek",
      description: "Az összes kedvenc könyvem egy helyen",
      userId: users[1].id,
      isPublic: true,
    },
  });

  // Add books to shelf
  for (let i = 0; i < Math.min(3, books.length); i++) {
    try {
      await prisma.shelfBook.create({
        data: { shelfId: shelf.id, bookId: books[i].id, position: i },
      });
    } catch {
      // Already exists
    }
  }
  console.log("Seeded demo shelf with books");

  console.log("\nDemo seeding complete!");
  console.log("Demo accounts created (see seed.ts for credentials)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
