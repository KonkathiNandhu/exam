using System;
using System.Text;
using System.Text.Json;

public static class Program {
    [MTAThread]
    public static int Main(string[] args) {
        Console.OutputEncoding = new UTF8Encoding(false);
        try {
            object result;
            if (args.Length == 1 && args[0] == "list")
                result = EdgeReader.Windows();
            else if (args.Length == 4 && args[0] == "read")
                result = EdgeReader.Read(long.Parse(args[1]), int.Parse(args[2]), args[3]);
            else throw new ArgumentException("Invalid reader request.");
            Console.WriteLine(JsonSerializer.Serialize(result, new JsonSerializerOptions { IncludeFields = true }));
            return 0;
        } catch (Exception error) {
            Console.Error.WriteLine(error.Message);
            return 1;
        }
    }
}
