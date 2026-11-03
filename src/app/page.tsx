export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">{process.env.NEXT_PUBLIC_APP_NAME}</h1>
      <p className="mt-2 text-neutral-600">Prototipo en construcción.</p>
    </main>
  );
}
