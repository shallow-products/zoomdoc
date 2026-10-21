# Step 3: Report

Open with the result, then the details. Write the labels in the user's language. If something needs the user's decision, ask it as one question at the end, with the recommendation and its reason after the options (the same form as `/zoomdoc:init`).

```text
[Result]     Pass or fail, with counts per kind of finding
[Fixed]      What was changed, as a list (path and what changed), or "nothing changed"
[Found]      Contradictions, duplicates and copied code that were found but not fixed, each with where and why
[Question]   Only if a decision is needed: one question, the options, the recommendation and its reason
```

Do not fix an item that needs the user's judgment (which of two contradicting documents is right); put it in [Found] and ask.
