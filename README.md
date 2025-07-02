# mod-forms

This repository contains the forms module for Hugo sites.

## Translation variables

The form template expects a data file under `data/forms` with the following keys. Example German and English files are provided in `exampleSite/data/forms`.

```
form:
  id: "contactForm"
  title: "..."
  submit_button_label: "Senden"    # de example
  toast_close_aria_label: "Schließen" # de example
  success_toast_message: "..."
  error_toast_message: "..."
  fields: [...]
```

English values for the new keys would be `Send` and `Close`.
