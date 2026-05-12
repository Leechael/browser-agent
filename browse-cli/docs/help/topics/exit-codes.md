# Exit Codes

browse uses the following exit codes:

| Code | Meaning     | When it occurs                     |
|------|-------------|------------------------------------|
| 0    | Success     | Command completed successfully     |
| 1    | Error       | General error (network, parsing)   |
| 2    | Auth failed | 401 or 403 from the API            |
| 3    | Not found   | 404 from the API                   |
