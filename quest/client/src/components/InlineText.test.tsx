import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { GUIDE_REPO } from "../pages/fetch";
import { InlineText } from "./InlineText";

const open = vi.fn();
vi.mock("../pages/PagePanel", () => ({ usePagePanel: () => ({ open }) }));

beforeEach(() => {
  open.mockClear();
});

test("shows backticks as code and double stars as bold", () => {
  const { container } = render(
    <p>
      <InlineText text="Run `claude` and read **every** line." />
    </p>,
  );
  expect(container.querySelector("code")).toHaveTextContent("claude");
  expect(container.querySelector("strong")).toHaveTextContent("every");
  expect(container.querySelector("p")).toHaveTextContent(
    "Run claude and read every line.",
  );
});

test("code inside a link's words shows as code, not backticks", () => {
  const { container } = render(
    <p>
      <InlineText text="Download the partial [`tdd` skill](https://example.com/SKILL.md) and the [`code-reviewer`](beginner/README.md)." />
    </p>,
  );
  const links = screen.getAllByRole("link");
  expect(links[0]).toHaveAccessibleName("tdd skill");
  expect(links[0]?.querySelector("code")).toHaveTextContent("tdd");
  expect(links[1]?.querySelector("code")).toHaveTextContent("code-reviewer");
  expect(container.querySelector("p")?.textContent).not.toContain("`");
});

test("a web link opens in a new tab", () => {
  render(
    <InlineText text="See [the docs](https://code.claude.com/docs/en/overview)." />,
  );
  const link = screen.getByRole("link", { name: "the docs" });
  expect(link).toHaveAttribute(
    "href",
    "https://code.claude.com/docs/en/overview",
  );
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
});

test("a repository page opens in the page panel, at its heading", async () => {
  const user = userEvent.setup();
  render(
    <InlineText text="Read [Lesson 2](beginner/02-first-session.md#why) first." />,
  );
  await user.click(screen.getByRole("link", { name: "Lesson 2" }));
  expect(open).toHaveBeenCalledWith("beginner/02-first-session.md", "why");
});

// The app serves no page at a repository path, so the href is the page on
// GitHub, for a new tab or a middle click (263).
test("a repository page's href is the page on GitHub at main, in a new tab", () => {
  render(
    <InlineText text="[lesson 2](docs/beginner/02-permission-modes-and-plan-mode.md#worked-example) and [memory](docs/beginner/05-project-memory.md)" />,
  );
  const lesson = screen.getByRole("link", { name: "lesson 2" });
  expect(lesson).toHaveAttribute(
    "href",
    `${GUIDE_REPO}/blob/main/docs/beginner/02-permission-modes-and-plan-mode.md#worked-example`,
  );
  expect(lesson).toHaveAttribute("target", "_blank");
  expect(lesson).toHaveAttribute("rel", "noopener noreferrer");
  expect(screen.getByRole("link", { name: "memory" })).toHaveAttribute(
    "href",
    `${GUIDE_REPO}/blob/main/docs/beginner/05-project-memory.md`,
  );
});

test("a click with a modifier key or another button leaves the page to the browser", () => {
  render(<InlineText text="[Lesson 2](beginner/02-first-session.md)" />);
  const link = screen.getByRole("link", { name: "Lesson 2" });
  for (const init of [
    { metaKey: true },
    { ctrlKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 },
  ]) {
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      ...init,
    });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  }
  expect(open).not.toHaveBeenCalled();
});

test("other links and HTML stay text", () => {
  const { container } = render(
    <InlineText text="[x](javascript:alert(1)) [up](../README.md) <b>hi</b>" />,
  );
  expect(container.querySelector("a")).toBeNull();
  expect(container.querySelector("b")).toBeNull();
  expect(container).toHaveTextContent("<b>hi</b>");
});
