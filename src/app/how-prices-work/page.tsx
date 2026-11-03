import { loadConfig } from "../../lib/config";

export const dynamic = "force-dynamic";

export default function HowPricesWork() {
  const cfg = loadConfig();
  return (
    <>
      <h1>How prices work</h1>
      <h2>Where prices come from</h2>
      <p>
        Prices are noted by hand in shops, or sent in by people who shop there. We do not copy prices from any shop&apos;s website or app. Right now the
        app may be running on sample data. Sample prices are made up, they are marked &quot;sample&quot;, and they say nothing about real shops.
      </p>
      <h2>How old a price can be</h2>
      <p>
        Every price shows when it was seen. A price older than {cfg.freshnessDays} days is not used at all. We would rather show nothing than something that
        is probably out of date. An offer that has ended is dropped too.
      </p>
      <h2>How we rank</h2>
      <p>
        Shops are ranked by price per kg, per litre or per item, and nothing else. If two prices are the same, the nearer shop comes first. No shop pays to be
        listed or to be placed higher. Distance is a straight line, not a walking or driving route.
      </p>
      <h2>Sizes and brands</h2>
      <p>
        An item like &quot;milk&quot; means about one litre, so a big pack is not compared with a small one. Any brand counts. The answer shows which one it
        picked.
      </p>
      <h2>The saving</h2>
      <p>
        The saving compares buying each item where it is cheapest against buying at the one shop that sells most of your list. It only counts items both
        sides cover, so a shop does not look cheap just because it lacks things. Extra trips cost time and money, so decide if they are worth it.
      </p>
      <h2>When prices are wrong</h2>
      <p>
        Prices can be wrong or out of date, and an item may be out of stock. The price on the shelf always wins. Use &quot;Price looks wrong?&quot; on an
        answer and we will look at it. Items that could not be matched or priced are shown as such and left out of the total.
      </p>
    </>
  );
}
