// Side effects first (i18n must be initialized before any screen renders), then the router entry.
import "./src/lib/i18n";
import "expo-router/entry";
