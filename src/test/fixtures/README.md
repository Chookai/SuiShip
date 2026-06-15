# Test Fixtures

Drop sample PDFs here for integration testing. The unit tests (`aggregator.test.ts`, `cross-validator.test.ts`) use synthetic data and do not require real files.

For end-to-end / manual testing, place one of each document type plus at least one garbage file:

| Filename (suggested)       | Contents                                     |
|----------------------------|----------------------------------------------|
| `commercial-invoice.pdf`   | A commercial invoice with prices + line items |
| `packing-list.pdf`         | A packing list (no prices)                   |
| `bill-of-lading.pdf`       | A house or master B/L                        |
| `certificate-of-origin.pdf`| A COO with chamber signature                 |
| `garbage.pdf`              | Any non-shipping doc (resume, screenshot)    |

Files are NOT committed to git — add them manually when running live tests.
ANTHROPIC_API_KEY must be set in the environment to run live extractions.
