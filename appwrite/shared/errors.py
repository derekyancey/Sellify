class HttpError(Exception):
    """An error with an HTTP status that site-ops returns to the dashboard as {"error": message}."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status
