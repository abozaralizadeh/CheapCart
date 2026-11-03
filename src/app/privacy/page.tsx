import { loadConfig } from "../../lib/config";

export const dynamic = "force-dynamic";

export default function Privacy() {
  const cfg = loadConfig();
  return (
    <>
      <h1>Privacy</h1>
      <p className="error">
        Draft. A lawyer has not reviewed this page yet, so do not rely on it. It must be checked and approved before any real launch.
      </p>
      <h2>Who is responsible</h2>
      <p>
        {cfg.operatorName}. Contact: {cfg.contactEmail}.
      </p>
      <h2>What we handle</h2>
      <ul>
        <li>
          <strong>Your list and your location.</strong> They stay on your device. When you ask for an answer, they are sent to the server to work it out. The
          server does not save them. Device locations are rounded to about 100 metres.
        </li>
        <li>
          <strong>List lines we cannot match.</strong> We save the text of the line (shortened) and the date, with nothing about you or your location. We use
          it to improve matching and delete it after 90 days. Please do not type personal details into your list.
        </li>
        <li>
          <strong>Prices you send in.</strong> We keep the shop, the product, the price and the date. A photo or text file is read in memory and is not saved.
          Lines that look like card numbers, loyalty numbers, names, phone numbers or email addresses are dropped before anything is kept.
        </li>
        <li>
          <strong>Wrong price reports.</strong> We keep the shop, the product, the date and your short note.
        </li>
        <li>
          <strong>Logs.</strong> Technical logs hold counts and errors, not your list, your location or your address.
        </li>
      </ul>
      <h2>What we do not do</h2>
      <p>No accounts, no tracking cookies, no third-party analytics, no ads, and no selling or sharing of data.</p>
      <h2>Your rights</h2>
      <p>Write to the contact address above to ask what we hold, to correct it or to have it removed.</p>
    </>
  );
}
