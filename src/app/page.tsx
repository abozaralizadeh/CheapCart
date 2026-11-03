import ListApp from "../components/ListApp";

export default function Home() {
  return (
    <>
      <h1>Where should I buy it?</h1>
      <p className="muted">Add your shopping list. For each item you see the cheapest shop near you.</p>
      <ListApp />
    </>
  );
}
