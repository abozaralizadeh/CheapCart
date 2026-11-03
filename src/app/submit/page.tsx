import SubmitApp from "../../components/SubmitApp";

export default function Submit() {
  return (
    <>
      <h1>Send in prices</h1>
      <p className="muted">
        Seen a price in a shop? Paste a receipt as text or choose a text file. You check every line before anything is sent. Nothing is saved except the
        prices you confirm. Reading photos is not available yet.
      </p>
      <SubmitApp />
    </>
  );
}
