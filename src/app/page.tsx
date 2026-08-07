import { redirect } from "next/navigation";

// Redirecionamento temporário — substituído pela tela real de login na Task 10.
export default function Home() {
  redirect("/login");
}
