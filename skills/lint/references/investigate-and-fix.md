# Step 2: Investigate and fix

- Fix the reported places to match the desired state. For links, confirm the file exists before fixing.
- Look for what static checks cannot find:
  1. **Factual contradictions**: do documents disagree about design or specification?
  2. **Duplicates**: is a similar concept written in several files? (one concept = one file)
  3. **Copied code**: is something that can be read from the code written out at length?
- Destructive operations such as deleting or moving need the target shown and the user's approval first (the procedure is in the `zoomdoc:move` skill).
