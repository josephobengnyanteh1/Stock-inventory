// Frontend entry point. Dashboard values are demonstration data for now.
// Later, use functions from api.js to load real data from the backend.
const todayElement = document.querySelector("#today");

if (todayElement) {
  todayElement.textContent = new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium"
  }).format(new Date());
}
