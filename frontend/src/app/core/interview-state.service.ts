import { Injectable, signal } from "@angular/core";

@Injectable({ providedIn: "root" })
export class InterviewStateService {
  domain = signal("dsa");
  difficulty = signal("medium");
  interviewId = signal("");
}
