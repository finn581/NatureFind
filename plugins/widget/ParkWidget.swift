import WidgetKit
import SwiftUI

struct ParkEntry: TimelineEntry {
    let date: Date
    let parkName: String
    let parkState: String
    let emoji: String
}

struct ParkProvider: TimelineProvider {
    let parks: [(String, String, String)] = [
        ("Yosemite", "California", "\u{1F3D4}\u{FE0F}"),
        ("Yellowstone", "Wyoming", "\u{1F9AC}"),
        ("Grand Canyon", "Arizona", "\u{1F3DC}\u{FE0F}"),
        ("Zion", "Utah", "\u{1FAA8}"),
        ("Glacier", "Montana", "\u{2744}\u{FE0F}"),
        ("Rocky Mountain", "Colorado", "\u{26F0}\u{FE0F}"),
        ("Acadia", "Maine", "\u{1F30A}"),
        ("Olympic", "Washington", "\u{1F332}"),
        ("Grand Teton", "Wyoming", "\u{1F98C}"),
        ("Bryce Canyon", "Utah", "\u{1F305}"),
        ("Arches", "Utah", "\u{1FAA8}"),
        ("Canyonlands", "Utah", "\u{1F3DC}\u{FE0F}"),
        ("Death Valley", "California", "\u{2600}\u{FE0F}"),
        ("Joshua Tree", "California", "\u{1F335}"),
        ("Sequoia", "California", "\u{1F332}"),
        ("Mount Rainier", "Washington", "\u{1F5FB}"),
        ("Crater Lake", "Oregon", "\u{1F4A7}"),
        ("Denali", "Alaska", "\u{1F43B}"),
        ("Everglades", "Florida", "\u{1F40A}"),
        ("Great Smoky Mountains", "Tennessee", "\u{1F32B}\u{FE0F}"),
        ("Shenandoah", "Virginia", "\u{1F342}"),
        ("Big Bend", "Texas", "\u{1F335}"),
        ("Badlands", "South Dakota", "\u{1F985}"),
        ("Redwood", "California", "\u{1F332}"),
        ("Hawaii Volcanoes", "Hawaii", "\u{1F30B}"),
        ("Haleakala", "Hawaii", "\u{1F305}"),
        ("Carlsbad Caverns", "New Mexico", "\u{1F987}"),
        ("Mesa Verde", "Colorado", "\u{1F3DB}\u{FE0F}"),
        ("Guadalupe Mountains", "Texas", "\u{26F0}\u{FE0F}"),
        ("Channel Islands", "California", "\u{1F40B}"),
    ]

    func placeholder(in context: Context) -> ParkEntry {
        ParkEntry(date: .now, parkName: "Yosemite", parkState: "California", emoji: "\u{1F3D4}\u{FE0F}")
    }

    func getSnapshot(in context: Context, completion: @escaping (ParkEntry) -> Void) {
        let park = parks.randomElement()!
        completion(ParkEntry(date: .now, parkName: park.0, parkState: park.1, emoji: park.2))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ParkEntry>) -> Void) {
        let calendar = Calendar.current
        let now = Date()
        let startOfDay = calendar.startOfDay(for: now)
        let dayOfYear = calendar.ordinality(of: .day, in: .year, for: now) ?? 0
        let park = parks[dayOfYear % parks.count]
        let entry = ParkEntry(date: startOfDay, parkName: park.0, parkState: park.1, emoji: park.2)
        let nextUpdate = calendar.date(byAdding: .hour, value: 6, to: now)!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }
}

struct ParkWidgetEntryView: View {
    var entry: ParkEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        ZStack {
            Color(red: 15/255, green: 15/255, blue: 26/255)

            VStack(alignment: .leading, spacing: 4) {
                Text(entry.emoji)
                    .font(family == .systemSmall ? .title2 : .largeTitle)

                Text(entry.parkName)
                    .font(family == .systemSmall ? .headline : .title2)
                    .fontWeight(.bold)
                    .foregroundStyle(.white)
                    .lineLimit(2)

                Text(entry.parkState)
                    .font(family == .systemSmall ? .caption : .subheadline)
                    .foregroundStyle(Color(red: 74/255, green: 222/255, blue: 128/255))

                if family != .systemSmall {
                    Spacer()
                    Text("Explore in NatureFind")
                        .font(.caption2)
                        .foregroundStyle(.gray)
                }
            }
            .padding()
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
}

@main
struct ParkWidget: Widget {
    let kind = "ParkWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ParkProvider()) { entry in
            ParkWidgetEntryView(entry: entry)
                .containerBackground(Color(red: 15/255, green: 15/255, blue: 26/255), for: .widget)
        }
        .configurationDisplayName("Park of the Day")
        .description("Discover a new national park every day")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
