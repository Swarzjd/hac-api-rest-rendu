export function handleError(err, res) {
    // 121 = DocumentValidationFailed (rejected by the collection's $jsonSchema)
    if (err.code === 121) {
        return res.status(400).json({ error: "Document failed validation", details: err.errInfo });
    }
    console.error(err);
    res.status(500).json({error: "Internal server error"});
}