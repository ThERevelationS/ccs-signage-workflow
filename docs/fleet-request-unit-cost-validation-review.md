# Fleet request unit cost validation

Fleet request cost values are carried from requests into FleetPart or FleetFluid records when an admin receives stock. The browser order form already marks unit cost as nonnegative, but the server previously accepted negative and malformed values through create, edit, and order actions. A previously saved invalid value could also be copied into a new Fleet inventory record during receiving.

The Fleet request action now validates optional unit cost values on create, edit, and order. Blank costs remain optional; zero is valid. Negative, nonnumeric, nonfinite, and nonscalar values are rejected. Receiving checks an existing request's saved value before creating or updating inventory and returns a review conflict if that legacy value is invalid. No automatic correction is made.

Synthetic coverage verifies cost parsing and wiring to each mutation boundary. It uses no Base44 production entities or Fleet records.
