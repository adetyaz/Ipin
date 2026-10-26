import type { HandleClientError } from "@sveltejs/kit"

// Unexpected errors in the browser: always log the real error, and in
// development show its message on the error page instead of "Internal Error",
// so a crash explains itself during testing.
export const handleError: HandleClientError = ({ error, message }) => {
  console.error(error)
  return {
    message:
      import.meta.env.DEV && error instanceof Error ? error.message : message,
  }
}
