# Upgrade and reconnect workflow

Provide the final host-side commands to build/deploy a versioned image, reconnect to the active service task, stop/start the environment and roll back the image. Agents may prepare image changes but receive no production Docker authority.

Verify preservation of existing volume data during task replacement with a harmless marker. Keep backups distinct from image rollback: reverting an image does not reverse data migrations. Document that tmux survives SSH disconnects but not task replacement; saved files and persisted conversation state remain.

Acceptance: the user has tested, readable multiline upgrade/reconnect commands with the exact service/volume names and known restart behavior. Use the same rtee session remote1.md. Store activity notes under the owning act with concise filenames, not act-ID prefixes. Create further subacts for independently verifiable newly discovered work.
