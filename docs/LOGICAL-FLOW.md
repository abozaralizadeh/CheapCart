# Logical flows

All flows are Proposed, and all five are built. Flow 5 uses a stand-in reader that only understands plain text receipts.

## 1. From list to answer

This is the core of the product.

1. You open the app. Your last list loads from the device, if there is one.
2. You type items, one per line, and pick suggestions as you type.
3. You set a location and a search distance.
4. The app sends the list and the location to the server.
5. The server finds the prices (flow 3) and sends back the answer.
6. You see the cheapest place for every item, the total and the saving.
7. You switch to the shop view and go shopping.

```mermaid
flowchart TD
    A[Open app] --> B[Type or load list]
    B --> C{Location set?}
    C -- No --> D[Set location and distance]
    C -- Yes --> E[Send list and location to server]
    D --> E
    E --> F[Find cheapest fresh price per item]
    F --> G[Show results by item]
    G --> H[Switch to shop view]
    H --> I[Go shopping]
```

## 2. Setting your location

1. The app asks for a postcode, or offers to use the device location.
2. If you use device location, the browser asks for permission. If you refuse, you go back to the postcode.
3. A postcode must be on the launch area list. If it isn't, the app tells you the service isn't available there yet.
4. The location stays on the device. It's sent with each comparison and isn't stored on the server.

```mermaid
flowchart TD
    A[Location prompt] --> B{Which way?}
    B -- Postcode --> C{In launch area?}
    B -- Device --> D{Permission given?}
    D -- No --> A
    D -- Yes --> E{Inside launch area?}
    C -- No --> F[Say it is not available here yet]
    E -- No --> F
    C -- Yes --> G[Save on device]
    E -- Yes --> G
```

## 3. Finding the cheapest place

For each line on the list:

1. Match the line to an item. If there's no match, mark it "not found", and log the text with no location.
2. Find shops within the search distance.
3. Find prices for that item's products at those shops. Only packs inside the item's size band count. Only the newest price for each shop and product is used, and it's dropped if it's past the freshness limit or its promotion has ended.
4. If no prices are left, mark it "no price nearby".
5. Pick the lowest price per unit of measure, such as per kg or per litre.
6. If two shops tie, pick the nearer one.

Then for the whole list:

1. Add up the per-item prices, using the quantity on each line.
2. Find the best single shop: the one that covers the most items, then the one with the lowest total.
3. Work out the saving using only items both sides cover, and say how many items that is.
4. Group the results by shop.

```mermaid
flowchart TD
    A[List line] --> B{Matches an item?}
    B -- No --> C[Mark not found and log text]
    B -- Yes --> D[Find shops in range]
    D --> E[Keep fresh prices only]
    E --> F{Any prices left?}
    F -- No --> G[Mark no price nearby]
    F -- Yes --> H[Pick lowest unit price]
    H --> I{Tie?}
    I -- Yes --> J[Pick nearest shop]
    I -- No --> K[Keep that shop]
    J --> L[Add to totals]
    K --> L
    L --> M[Compare with best single shop]
    M --> N[Group by shop and return]
```

The server flow for one comparison:

```mermaid
sequenceDiagram
    participant U as Phone
    participant S as Server
    participant D as Database
    U->>S: List, location, distance
    S->>D: Match lines to items
    D-->>S: Items
    S->>D: Fresh prices at shops in range
    D-->>S: Prices
    S->>S: Work out cheapest, totals, saving
    S-->>U: Results
```

## 4. Loading prices

1. Someone collects prices in shops and fills in the CSV template.
2. The import command checks every row: known shop, known product, sensible whole-number price, valid date that isn't in the future.
3. Rows for a shop, product and day that already exist are skipped as duplicates.
4. A price far from the last known price (50% or more) is held back in `flagged.csv`. Bad rows are listed by row number and aren't loaded.
5. Good rows are added as new price records, so history is kept. After checking flagged rows, a person imports them with `--accept-flagged`.
6. A daily check counts prices by age. It exits with an error when most prices are stale, so a timer or monitor can alert.

```mermaid
flowchart TD
    A[Collect prices in shops] --> B[Fill in CSV]
    B --> C[Run import command]
    C --> D{Row valid?}
    D -- No --> E[Add to error report]
    D -- Yes --> F{Big jump from last price?}
    F -- Yes --> G[Flag for a person to check]
    F -- No --> H[Add new price record]
    G -- Confirmed --> H
    E --> I[Fix and re-import]
    I --> C
```

## 5. Sending in a price (Phase 2)

1. You paste a receipt as text or choose a file. Photos will work once a real reader is connected.
2. A reader turns it into shop, items, prices and date. The real reader would be an AI vision model. The built-in stand-in only reads plain text, and says so when given a photo.
3. Lines with card numbers, names, phone numbers or emails are dropped. The file is read in memory and never saved.
4. Each line is matched to an item and, when the size or brand makes it clear, to a product.
5. You check what was read, pick the product where it's unclear, fix prices and choose the shop.
6. Checks run on each line: known shop, a date within the last 7 days, a sensible price, and a price within 40% of what other shops charge.
7. Clear lines go live. Lines with no product, too few other prices to compare with, or a far-off price wait for a person, who runs `npm run review`.

```mermaid
flowchart TD
    A[Paste text or pick a file] --> B[Reader reads it in memory]
    B --> C[Drop lines with personal details]
    C --> D[You check and confirm]
    D --> K{Shop, date and amount valid?}
    K -- No --> J[Reject the line]
    K -- Yes --> E{Product matched?}
    E -- No --> H[Waits for a person]
    E -- Yes --> G{Close to other shops' prices?}
    G -- No --> H
    G -- Yes --> I[Price goes live]
    H -- Approved --> I
    H -- Rejected --> J
```
